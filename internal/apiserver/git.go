package apiserver

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// gitResult mirrors the { code, stdout, stderr } object returned to the client.
type gitResult struct {
	Code   int    `json:"code"`
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
}

// runGitInWorkTree mirrors runGitInWorkTree (spawnSync git with GIT_TERMINAL_PROMPT=0).
func runGitInWorkTree(workTree string, args []string) gitResult {
	cmd := exec.Command("git", args...)
	cmd.Dir = workTree
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	hideConsoleWindow(cmd)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			code = 1
		}
	}
	return gitResult{Code: code, Stdout: stdout.String(), Stderr: stderr.String()}
}

// runGitInDir runs git in a directory without inheriting the worktree env tweaks beyond prompt.
func runGitInDir(dir string, args []string) gitResult {
	return runGitInWorkTree(dir, args)
}

// gitCurrentLocalBranchName returns the checked-out local branch name, or "" when detached/unknown.
func gitCurrentLocalBranchName(workTree string) string {
	sym := runGitInWorkTree(workTree, []string{"symbolic-ref", "--short", "-q", "HEAD"})
	if sym.Code != 0 {
		return ""
	}
	name := strings.TrimSpace(sym.Stdout)
	if name == "" || strings.EqualFold(name, "HEAD") {
		return ""
	}
	verify := runGitInWorkTree(workTree, []string{"show-ref", "--verify", "--quiet", "refs/heads/" + name})
	if verify.Code != 0 {
		return ""
	}
	return name
}

type gitRemoteBranch struct {
	remote string
	branch string
}

// gitUpstreamRemoteBranch returns the configured upstream (e.g. origin/main), or empty values.
func gitUpstreamRemoteBranch(workTree string) gitRemoteBranch {
	res := runGitInWorkTree(workTree, []string{"rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"})
	if res.Code != 0 {
		return gitRemoteBranch{}
	}
	upstream := strings.TrimSpace(res.Stdout)
	idx := strings.Index(upstream, "/")
	if idx <= 0 || idx >= len(upstream)-1 {
		return gitRemoteBranch{}
	}
	return gitRemoteBranch{
		remote: upstream[:idx],
		branch: upstream[idx+1:],
	}
}

func gitRemoteBranchExists(workTree, remote, branch string) bool {
	ref := remote + "/" + branch
	if _, err := safeBranchRef(ref); err != nil {
		return false
	}
	verify := runGitInWorkTree(workTree, []string{"rev-parse", "--verify", "--quiet", "refs/remotes/" + ref})
	return verify.Code == 0
}

// gitRemoteDefaultBranch returns the default branch on a remote after fetch (origin/HEAD symref).
func gitRemoteDefaultBranch(workTree, remote string) string {
	head := runGitInWorkTree(workTree, []string{"symbolic-ref", "-q", "refs/remotes/" + remote + "/HEAD"})
	if head.Code != 0 {
		return ""
	}
	ref := strings.TrimSpace(head.Stdout)
	prefix := "refs/remotes/" + remote + "/"
	if strings.HasPrefix(ref, prefix) {
		branch := strings.TrimPrefix(ref, prefix)
		if branch != "" && branch != "HEAD" {
			return branch
		}
	}
	return ""
}

// runGitFetchRemotePrune updates remote-tracking refs and drops deleted remote branches.
func runGitFetchRemotePrune(workTree, remote, pat, patUsername string) gitResult {
	if strings.TrimSpace(pat) == "" {
		return runGitInWorkTree(workTree, []string{"fetch", "--prune", remote})
	}
	gr := runGitInWorkTree(workTree, []string{"remote", "get-url", remote})
	if gr.Code != 0 {
		return gr
	}
	remoteURL := strings.TrimSpace(gr.Stdout)
	applied, err := applyHTTPSPat(remoteURL, pat, patUsername)
	if err != nil || !applied.usedPat {
		if err != nil {
			return gitResult{Code: 1, Stderr: err.Error()}
		}
		return gitResult{Code: 1, Stderr: "Укажите PAT для HTTPS fetch"}
	}
	restoreURL := httpsURLWithoutCredentials(remoteURL)
	setPat := runGitInWorkTree(workTree, []string{"remote", "set-url", remote, applied.cloneURL})
	if setPat.Code != 0 {
		return setPat
	}
	fetchResult := runGitInWorkTree(workTree, []string{"fetch", "--prune", remote})
	runGitInWorkTree(workTree, []string{"remote", "set-url", remote, restoreURL})
	return fetchResult
}

// resolveGitPullArgs picks `git pull remote branch` using remote-tracking refs refreshed by fetch.
func resolveGitPullArgs(workTree, remoteName, branchHint string) ([]string, string, error) {
	remote, err := safeRemoteName(firstNonEmpty(remoteName, "origin"))
	if err != nil {
		return nil, "", err
	}

	localBranch := gitCurrentLocalBranchName(workTree)
	if localBranch == "" {
		localBranch = strings.TrimSpace(branchHint)
	}

	tryBranch := func(branch string) ([]string, string, bool) {
		branch = strings.TrimSpace(branch)
		if branch == "" {
			return nil, "", false
		}
		safe, err := safeBranchRef(branch)
		if err != nil {
			return nil, "", false
		}
		if !gitRemoteBranchExists(workTree, remote, safe) {
			return nil, "", false
		}
		return []string{"pull", remote, safe}, safe, true
	}

	if args, branch, ok := tryBranch(localBranch); ok {
		return args, branch, nil
	}

	if upstream := gitUpstreamRemoteBranch(workTree); upstream.remote == remote {
		if args, branch, ok := tryBranch(upstream.branch); ok {
			return args, branch, nil
		}
	}

	if defaultBranch := gitRemoteDefaultBranch(workTree, remote); defaultBranch != "" {
		if args, branch, ok := tryBranch(defaultBranch); ok {
			return args, branch, nil
		}
	}

	if args, branch, ok := tryBranch(strings.TrimSpace(branchHint)); ok {
		return args, branch, nil
	}

	hint := localBranch
	if hint == "" {
		hint = strings.TrimSpace(branchHint)
	}
	if hint == "" {
		hint = "(текущая ветка не определена)"
	}
	return nil, "", fmt.Errorf(
		"На remote %s нет ветки для pull (локальная: %s). Обновите список веток или выполните checkout нужной ветки",
		remote,
		hint,
	)
}

type gitRefLine struct {
	current bool
	short   string
	full    string
}

func parseGitRefLines(stdout string) []gitRefLine {
	var lines []gitRefLine
	for _, line := range strings.Split(stdout, "\n") {
		raw := strings.TrimRight(line, "\r")
		if strings.TrimSpace(raw) == "" {
			continue
		}
		parts := strings.Split(raw, "\t")
		if len(parts) < 3 {
			continue
		}
		shortName := strings.TrimSpace(parts[1])
		full := strings.TrimSpace(parts[2])
		if shortName == "" || full == "" || reControlChars.MatchString(shortName) {
			continue
		}
		lines = append(lines, gitRefLine{
			current: strings.TrimSpace(parts[0]) == "*",
			short:   shortName,
			full:    full,
		})
	}
	return lines
}

// listGitBranches returns checkout-friendly branch names (without origin/ prefix for remote-only branches).
func listGitBranches(workTree, remoteName string) ([]map[string]any, error) {
	remote, err := safeRemoteName(firstNonEmpty(remoteName, "origin"))
	if err != nil {
		return nil, err
	}
	res := runGitInWorkTree(workTree, []string{
		"for-each-ref", "--sort=refname",
		"--format=%(HEAD)\t%(refname:short)\t%(refname)",
		"refs/heads", "refs/remotes/" + remote,
	})
	if res.Code != 0 {
		return nil, fmt.Errorf("%s", firstNonEmpty(strings.TrimSpace(res.Stderr), "Не удалось получить список веток"))
	}

	localNames := map[string]bool{}
	var branches []map[string]any
	remoteFullPrefix := "refs/remotes/" + remote + "/"

	for _, ln := range parseGitRefLines(res.Stdout) {
		if !strings.HasPrefix(ln.full, "refs/heads/") {
			continue
		}
		name := strings.TrimPrefix(ln.full, "refs/heads/")
		if name == "" {
			continue
		}
		localNames[name] = true
		branches = append(branches, map[string]any{
			"name":    name,
			"local":   true,
			"current": ln.current,
		})
	}

	for _, ln := range parseGitRefLines(res.Stdout) {
		if !strings.HasPrefix(ln.full, remoteFullPrefix) {
			continue
		}
		bare := strings.TrimPrefix(ln.full, remoteFullPrefix)
		if bare == "" || bare == "HEAD" || strings.HasSuffix(bare, "/HEAD") {
			continue
		}
		if localNames[bare] {
			continue
		}
		entry := map[string]any{
			"name":    bare,
			"local":   false,
			"current": ln.current,
		}
		if ln.short != "" {
			entry["remoteRef"] = ln.short
		}
		branches = append(branches, entry)
	}

	sort.Slice(branches, func(i, j int) bool {
		a, _ := branches[i]["name"].(string)
		b, _ := branches[j]["name"].(string)
		return a < b
	})
	return branches, nil
}

// gitResolveRemoteBranchRef maps a bare branch name to origin/branch when a remote-tracking ref exists.
func gitResolveRemoteBranchRef(workTree, remoteName, branch string) string {
	branch = strings.TrimSpace(branch)
	if branch == "" || strings.Contains(branch, "/") {
		return branch
	}
	remote, err := safeRemoteName(firstNonEmpty(remoteName, "origin"))
	if err != nil {
		return branch
	}
	candidate := remote + "/" + branch
	if runGitInWorkTree(workTree, []string{"rev-parse", "--verify", "--quiet", "refs/remotes/" + candidate}).Code == 0 {
		return candidate
	}
	return branch
}

func httpsURLWithoutCredentials(urlString string) string {
	u, err := url.Parse(urlString)
	if err != nil {
		return urlString
	}
	if u.Scheme != "https" {
		return urlString
	}
	u.User = nil
	return u.String()
}

type appliedPat struct {
	cloneURL string
	usedPat  bool
}

// applyHTTPSPat mirrors applyHttpsPat.
func applyHTTPSPat(originalURL, pat, usernameOverride string) (appliedPat, error) {
	token := strings.TrimSpace(pat)
	if token == "" {
		return appliedPat{cloneURL: originalURL, usedPat: false}, nil
	}
	u, err := url.Parse(originalURL)
	if err != nil {
		return appliedPat{}, errors.New("Некорректный URL")
	}
	if u.Scheme != "https" {
		return appliedPat{}, errors.New("PAT поддерживается только для HTTPS (не для git@… / ssh://)")
	}
	if len(token) > 4096 {
		return appliedPat{}, errors.New("PAT слишком длинный")
	}
	host := strings.ToLower(u.Hostname())
	user := strings.TrimSpace(usernameOverride)
	if user == "" {
		switch {
		case host == "github.com" || strings.HasSuffix(host, ".github.com"):
			user = "x-access-token"
		case strings.Contains(host, "gitlab"):
			user = "oauth2"
		default:
			user = "git"
		}
	}
	u.User = url.UserPassword(user, token)
	return appliedPat{cloneURL: u.String(), usedPat: true}, nil
}

var (
	reRemoteName      = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.-]*$`)
	reBranchRef       = regexp.MustCompile(`^[a-zA-Z0-9._\-/:^]+$`)
	reCheckoutUnsafe  = regexp.MustCompile("\\.\\.|^\\s|\\s$|[\\x00-\\x1f\\x7f;|&`$<>\\\\\"]")
	reNothingToCommit = regexp.MustCompile(`(?i)nothing to commit|no changes added`)
	reControlChars    = regexp.MustCompile("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]")
	reHeadSuffix      = regexp.MustCompile(`/HEAD$`)
)

// parseURLStrict mirrors `new URL(x)` validity (requires an absolute URL).
func parseURLStrict(s string) (*url.URL, error) {
	u, err := url.Parse(s)
	if err != nil {
		return nil, err
	}
	if u.Scheme == "" {
		return nil, errors.New("invalid URL")
	}
	return u, nil
}

func safeRemoteName(name string) (string, error) {
	s := strings.TrimSpace(name)
	if s == "" || !reRemoteName.MatchString(s) {
		return "", errors.New("Некорректное имя remote (например origin)")
	}
	return s, nil
}

func safeBranchRef(ref string) (string, error) {
	s := strings.TrimSpace(ref)
	if s == "" {
		return "", nil
	}
	if len(s) > 512 || !reBranchRef.MatchString(s) {
		return "", errors.New("Некорректное имя ветки или refspec")
	}
	return s, nil
}

func safeCheckoutTarget(ref string) (string, error) {
	s := strings.TrimSpace(ref)
	if s == "" {
		return "", errors.New("Укажите ветку или ref")
	}
	if len(s) > 256 {
		return "", errors.New("Строка ref слишком длинная")
	}
	if reCheckoutUnsafe.MatchString(s) {
		return "", errors.New("Некорректное имя ветки или ref")
	}
	return s, nil
}

// resolveWorkTreeDir resolves a work tree directory under GIT_REPO_ROOT.
// An empty or "." input refers to GIT_REPO_ROOT itself.
func (s *Server) resolveWorkTreeDir(dirInput string) (abs, rel string, err error) {
	trimmed := strings.TrimSpace(dirInput)
	if trimmed == "" || trimmed == "." {
		repoRoot := s.RepoRoot()
		return repoRoot, ".", nil
	}
	trimmed = strings.TrimLeft(trimmed, "\\/")
	trimmed = strings.ReplaceAll(trimmed, "\\", "/")
	if trimmed == "" || strings.Contains(trimmed, "..") {
		return "", "", errors.New("Некорректное имя каталога")
	}
	for _, seg := range strings.Split(trimmed, "/") {
		if seg == ".." || seg == "." {
			return "", "", errors.New("Некорректный путь")
		}
	}
	repoRoot := s.RepoRoot()
	abs = filepath.Join(repoRoot, filepath.FromSlash(trimmed))
	relToRoot, e := filepath.Rel(repoRoot, abs)
	if e != nil || strings.HasPrefix(relToRoot, "..") || filepath.IsAbs(relToRoot) {
		return "", "", errors.New("Путь выходит за пределы GIT_REPO_ROOT")
	}
	return abs, filepath.ToSlash(relToRoot), nil
}

// resolveAllowedModelPath mirrors resolveAllowedModelPath.
func (s *Server) resolveAllowedModelPath(relPath string) (abs, rel string, err error) {
	if strings.TrimSpace(relPath) == "" {
		return "", "", errors.New("Укажите относительный путь к файлу в репозитории")
	}
	trimmed := strings.TrimLeft(strings.TrimSpace(relPath), "\\/")
	lower := strings.ToLower(trimmed)
	if !strings.HasSuffix(lower, ".archimate") && !strings.HasSuffix(lower, ".xml") {
		return "", "", errors.New("Разрешены только файлы .archimate и .xml")
	}
	repoRoot := s.RepoRoot()
	abs = filepath.Join(repoRoot, filepath.FromSlash(trimmed))
	relToRoot, e := filepath.Rel(repoRoot, abs)
	if e != nil || strings.HasPrefix(relToRoot, "..") || filepath.IsAbs(relToRoot) {
		return "", "", errors.New("Путь выходит за пределы GIT_REPO_ROOT")
	}
	return abs, filepath.ToSlash(relToRoot), nil
}

// resolveGitWorkTreeFromOptionalModelPath mirrors the same helper.
func (s *Server) resolveGitWorkTreeFromOptionalModelPath(relPath string) string {
	rootResolved := s.RepoRoot()
	if strings.TrimSpace(relPath) == "" {
		return rootResolved
	}
	trimmed := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(relPath), "\\/"), "\\", "/")
	if trimmed == "" || strings.Contains(trimmed, "..") {
		return rootResolved
	}
	absFile := filepath.Join(rootResolved, filepath.FromSlash(trimmed))
	relToRoot, err := filepath.Rel(rootResolved, absFile)
	if err != nil || strings.HasPrefix(relToRoot, "..") || filepath.IsAbs(relToRoot) {
		return rootResolved
	}
	dir := filepath.Dir(absFile)
	for {
		if pathExists(filepath.Join(dir, ".git")) {
			return dir
		}
		if dir == rootResolved {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return rootResolved
}

type modelGitContext struct {
	workTree      string
	abs           string
	relToRepoRoot string
	relInWorkTree string
}

// resolveModelGitContext mirrors resolveModelGitContext.
func (s *Server) resolveModelGitContext(relPathFromClient string) (modelGitContext, error) {
	abs, rel, err := s.resolveAllowedModelPath(relPathFromClient)
	if err != nil {
		return modelGitContext{}, err
	}
	workTree := s.resolveGitWorkTreeFromOptionalModelPath(rel)
	relInWorkTree, err := filepath.Rel(workTree, abs)
	if err != nil {
		return modelGitContext{}, err
	}
	normalized := filepath.ToSlash(relInWorkTree)
	if strings.HasPrefix(normalized, "..") || filepath.IsAbs(normalized) {
		return modelGitContext{}, errors.New("Файл модели вне git-репозитория (нет .git над каталогом файла)")
	}
	return modelGitContext{workTree: workTree, abs: abs, relToRepoRoot: rel, relInWorkTree: normalized}, nil
}

// resolveGitStagePaths mirrors resolveGitStagePaths.
func resolveGitStagePaths(relInWorkTree string) []string {
	normalized := strings.TrimLeft(strings.ReplaceAll(strings.TrimSpace(relInWorkTree), "\\", "/"), "/")
	if normalized == "" {
		return []string{}
	}
	base := normalized
	if idx := strings.LastIndex(normalized, "/"); idx >= 0 {
		base = normalized[idx+1:]
	}
	if base == "folder.xml" {
		dir := ""
		if idx := strings.LastIndex(normalized, "/"); idx >= 0 {
			dir = normalized[:idx]
		}
		if dir != "" && dir != "." {
			return []string{dir}
		}
	}
	return []string{normalized}
}

// resolveConfiguredWorkTree mirrors resolveConfiguredWorkTree.
func (s *Server) resolveConfiguredWorkTree(modelPath, workFolderInput string) string {
	mp := strings.TrimSpace(modelPath)
	if mp != "" {
		return s.resolveGitWorkTreeFromOptionalModelPath(mp)
	}
	rel := "."
	if strings.TrimSpace(workFolderInput) != "" {
		if _, r, err := s.resolveWorkTreeDir(strings.TrimSpace(workFolderInput)); err == nil {
			rel = r
		}
	}
	repoRoot := s.RepoRoot()
	abs := filepath.Join(repoRoot, filepath.FromSlash(rel))
	if pathExists(filepath.Join(abs, ".git")) {
		return abs
	}
	return repoRoot
}

type splitModelRoot struct {
	modelRootAbs string
	modelRoot    string
	manifestAbs  string
	manifestRel  string
}

// resolveSplitModelRootFromManifestPath mirrors resolveSplitModelRootFromManifestPath.
func (s *Server) resolveSplitModelRootFromManifestPath(manifestRel string) (splitModelRoot, error) {
	abs, _, err := s.resolveAllowedModelPath(manifestRel)
	if err != nil {
		return splitModelRoot{}, err
	}
	modelRootAbs := filepath.Dir(abs)
	modelRoot, err := filepath.Rel(s.RepoRoot(), modelRootAbs)
	if err != nil {
		return splitModelRoot{}, err
	}
	modelRoot = filepath.ToSlash(modelRoot)
	if strings.HasPrefix(modelRoot, "..") || filepath.IsAbs(modelRoot) {
		return splitModelRoot{}, errors.New("Путь выходит за пределы GIT_REPO_ROOT")
	}
	return splitModelRoot{modelRootAbs: modelRootAbs, modelRoot: modelRoot, manifestAbs: abs, manifestRel: manifestRel}, nil
}

// resolveSplitModelFilePath mirrors resolveSplitModelFilePath.
func (s *Server) resolveSplitModelFilePath(modelRoot, relativePath string) (abs, rel string, err error) {
	root := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(modelRoot), "\\/"), "\\", "/")
	relInput := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(relativePath), "\\/"), "\\", "/")
	if root == "" || relInput == "" || strings.Contains(relInput, "..") || strings.Contains(root, "..") {
		return "", "", errors.New("Некорректный путь к файлу модели")
	}
	repoRoot := s.RepoRoot()
	abs = filepath.Join(repoRoot, filepath.FromSlash(root), filepath.FromSlash(relInput))
	modelRootAbs := filepath.Join(repoRoot, filepath.FromSlash(root))
	relToModel, e := filepath.Rel(modelRootAbs, abs)
	if e != nil || strings.HasPrefix(relToModel, "..") || filepath.IsAbs(relToModel) {
		return "", "", errors.New("Путь выходит за пределы каталога модели")
	}
	return abs, filepath.ToSlash(relToModel), nil
}

// listSplitModelXmlPathsAtRef mirrors listSplitModelXmlPathsAtRef.
func listSplitModelXmlPathsAtRef(workTree, ref, modelRootRel string) ([]string, error) {
	root := strings.TrimRight(strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(modelRootRel), "\\/"), "\\", "/"), "/")
	if root == "" {
		return nil, errors.New("Не указан каталог модели")
	}
	spec := fmt.Sprintf("%s:%s", ref, root)
	result := runGitInWorkTree(workTree, []string{"ls-tree", "-r", "--name-only", spec})
	if result.Code != 0 {
		msg := strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, "git ls-tree"))
		return nil, errors.New(msg)
	}
	var out []string
	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.ReplaceAll(strings.TrimSpace(line), "\\", "/")
		if strings.HasSuffix(strings.ToLower(line), ".xml") {
			out = append(out, line)
		}
	}
	return out, nil
}

// readRepoFileAtRef mirrors readRepoFileAtRef.
func readRepoFileAtRef(workTree, ref, repoRelativePath string) (string, error) {
	rel := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(repoRelativePath), "\\/"), "\\", "/")
	if rel == "" || strings.Contains(rel, "..") {
		return "", errors.New("Некорректный путь к файлу")
	}
	result := runGitInWorkTree(workTree, []string{"show", fmt.Sprintf("%s:%s", ref, rel)})
	if result.Code != 0 {
		msg := strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, "git show"))
		return "", errors.New(msg)
	}
	return result.Stdout, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func pathExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
