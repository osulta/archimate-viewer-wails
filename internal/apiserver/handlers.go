package apiserver

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func errJSON(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

func readBody(r *http.Request) map[string]any {
	m := map[string]any{}
	if r.Body == nil {
		return m
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, 256<<20))
	if err != nil || len(data) == 0 {
		return m
	}
	_ = json.Unmarshal(data, &m)
	return m
}

func bodyStr(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// bodyTrue mirrors `x === true || x === 1`.
func bodyTrue(m map[string]any, key string) bool {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case bool:
			return t
		case float64:
			return t == 1
		}
	}
	return false
}

func dirnamePosix(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	if idx := strings.LastIndex(p, "/"); idx >= 0 {
		if idx == 0 {
			return "/"
		}
		return p[:idx]
	}
	return "."
}

func mergeGitResult(m map[string]any, r gitResult) {
	m["code"] = r.Code
	m["stdout"] = r.Stdout
	m["stderr"] = r.Stderr
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "repoRoot": s.RepoRoot()})
}

// handleRepoRoot exposes the configured GIT_REPO_ROOT. GET returns the current
// and default paths; POST { repoRoot } switches it for subsequent operations.
func (s *Server) handleRepoRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":              true,
			"repoRoot":        s.RepoRoot(),
			"defaultRepoRoot": s.DefaultRepoRoot(),
		})
		return
	}
	if r.Method != http.MethodPost {
		errJSON(w, http.StatusMethodNotAllowed, "Метод не поддерживается")
		return
	}
	body := readBody(r)
	next := strings.TrimSpace(bodyStr(body, "repoRoot"))
	if bodyTrue(body, "reset") {
		next = s.DefaultRepoRoot()
	}
	applied, err := s.SetRepoRoot(next)
	if err != nil {
		// SetRepoRoot may return a non-empty path together with a persistence error.
		resp := map[string]any{"ok": false, "error": err.Error()}
		if applied != "" {
			resp["repoRoot"] = applied
		}
		writeJSON(w, http.StatusBadRequest, resp)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"repoRoot":        applied,
		"defaultRepoRoot": s.DefaultRepoRoot(),
	})
}

func (s *Server) handleRepoState(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	workFolderIn := strings.TrimSpace(bodyStr(body, "workFolder"))
	abs, rel, err := s.resolveWorkTreeDir(workFolderIn)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	hasDotGit := pathExists(filepath.Join(abs, ".git"))
	resp := map[string]any{"ok": true, "workFolder": rel, "hasDotGit": hasDotGit}
	if hasDotGit {
		if gr := runGitInWorkTree(abs, []string{"remote", "get-url", "origin"}); gr.Code == 0 {
			if v := strings.TrimSpace(gr.Stdout); v != "" {
				resp["remoteUrl"] = v
			}
		}
		if br := runGitInWorkTree(abs, []string{"rev-parse", "--abbrev-ref", "HEAD"}); br.Code == 0 {
			if v := strings.TrimSpace(br.Stdout); v != "" {
				resp["currentBranch"] = v
			}
		}
		if entry := findModelEntryUnder(abs); entry != nil {
			if mp, e := filepath.Rel(s.RepoRoot(), entry.absPath); e == nil {
				resp["modelPath"] = filepath.ToSlash(mp)
				resp["modelLayout"] = string(entry.layout)
			}
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	workFolderIn := strings.TrimSpace(bodyStr(body, "workFolder"))
	abs, rel, err := s.resolveWorkTreeDir(workFolderIn)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	remoteName := bodyStr(body, "remote")
	if strings.TrimSpace(remoteName) == "" {
		remoteName = "origin"
	}
	remoteName, err = safeRemoteName(remoteName)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	remoteURLRaw := strings.TrimSpace(bodyStr(body, "remoteUrl"))
	pat := strings.TrimSpace(bodyStr(body, "pat"))
	hasGit := pathExists(filepath.Join(abs, ".git"))

	if !hasGit && (remoteURLRaw != "" || pat != "") {
		errJSON(w, http.StatusBadRequest, "В каталоге «"+rel+"» нет репозитория (.git). Сначала выполните git clone в эту папку.")
		return
	}
	if !hasGit {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "workFolder": rel, "hasDotGit": false})
		return
	}
	if hasGit && remoteURLRaw == "" && pat != "" {
		if cur := runGitInWorkTree(abs, []string{"remote", "get-url", remoteName}); cur.Code == 0 {
			remoteURLRaw = strings.TrimSpace(cur.Stdout)
		}
	}
	if pat != "" && remoteURLRaw == "" {
		errJSON(w, http.StatusBadRequest, "Укажите URL репозитория или настройте remote в репозитории для проверки PAT.")
		return
	}
	if remoteURLRaw != "" {
		clean := httpsURLWithoutCredentials(remoteURLRaw)
		if _, e := parseURLStrict(clean); e != nil {
			errJSON(w, http.StatusBadRequest, "Некорректный URL репозитория")
			return
		}
		getO := runGitInWorkTree(abs, []string{"remote", "get-url", remoteName})
		var addOrSet []string
		if getO.Code == 0 {
			addOrSet = []string{"remote", "set-url", remoteName, clean}
		} else {
			addOrSet = []string{"remote", "add", remoteName, clean}
		}
		if sr := runGitInWorkTree(abs, addOrSet); sr.Code != 0 {
			resp := map[string]any{"ok": false, "error": firstNonEmpty(strings.TrimSpace(sr.Stderr), "Не удалось задать URL remote"), "detail": sr}
			writeJSON(w, http.StatusBadRequest, resp)
			return
		}
	}
	patVerified := false
	if pat != "" && remoteURLRaw != "" {
		applied, e := applyHTTPSPat(remoteURLRaw, pat, bodyStr(body, "patUsername"))
		if e != nil {
			errJSON(w, http.StatusBadRequest, e.Error())
			return
		}
		if !applied.usedPat {
			errJSON(w, http.StatusBadRequest, "PAT для проверки доступен только с HTTPS URL")
			return
		}
		clean := httpsURLWithoutCredentials(remoteURLRaw)
		if setP := runGitInWorkTree(abs, []string{"remote", "set-url", remoteName, applied.cloneURL}); setP.Code != 0 {
			errJSON(w, http.StatusBadRequest, firstNonEmpty(strings.TrimSpace(setP.Stderr), "Не удалось применить PAT для проверки"))
			return
		}
		verify := runGitInWorkTree(abs, []string{"ls-remote", "-q", remoteName, "HEAD"})
		restore := runGitInWorkTree(abs, []string{"remote", "set-url", remoteName, clean})
		if verify.Code != 0 {
			resp := map[string]any{"ok": false, "error": firstNonEmpty(strings.TrimSpace(verify.Stderr), "Не удалось получить доступ по PAT (ls-remote)"), "verify": verify}
			writeJSON(w, http.StatusBadRequest, resp)
			return
		}
		if restore.Code != 0 {
			errJSON(w, http.StatusBadRequest, firstNonEmpty(strings.TrimSpace(restore.Stderr), "Проверка прошла, но не удалось убрать PAT из URL remote"))
			return
		}
		patVerified = true
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "workFolder": rel, "hasDotGit": true, "patVerified": patVerified})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	filePath := bodyStr(body, "path")
	if filePath != "" {
		ctx, err := s.resolveModelGitContext(filePath)
		if err != nil {
			errJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		stagePaths := resolveGitStagePaths(ctx.relInWorkTree)
		args := append([]string{"status", "--porcelain=v1", "-u", "--"}, stagePaths...)
		result := runGitInWorkTree(ctx.workTree, args)
		resp := map[string]any{"ok": result.Code == 0, "workTree": ctx.workTree}
		mergeGitResult(resp, result)
		writeJSON(w, http.StatusOK, resp)
		return
	}
	workTree := s.resolveConfiguredWorkTree("", bodyStr(body, "workFolder"))
	result := runGitInWorkTree(workTree, []string{"status", "--porcelain=v1", "-u"})
	resp := map[string]any{"ok": result.Code == 0}
	mergeGitResult(resp, result)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleShowFile(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	filePath := bodyStr(body, "path")
	ref, err := safeBranchRef(bodyStr(body, "ref"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if filePath == "" {
		errJSON(w, http.StatusBadRequest, "Укажите path к файлу модели в репозитории")
		return
	}
	if ref == "" {
		errJSON(w, http.StatusBadRequest, "Укажите ref (ветку) для сравнения")
		return
	}
	ctx, err := s.resolveModelGitContext(filePath)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	result := runGitInWorkTree(ctx.workTree, []string{"show", ref + ":" + ctx.relInWorkTree})
	if result.Code != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok":       false,
			"error":    firstNonEmpty(strings.TrimSpace(result.Stderr), strings.TrimSpace(result.Stdout), "git show"),
			"workTree": ctx.workTree,
			"ref":      ref,
			"path":     ctx.relInWorkTree,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"content":  result.Stdout,
		"workTree": ctx.workTree,
		"ref":      ref,
		"path":     ctx.relInWorkTree,
	})
}

func (s *Server) handleAdd(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	ctx, err := s.resolveModelGitContext(bodyStr(body, "path"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	stagePaths := resolveGitStagePaths(ctx.relInWorkTree)
	result := runGitInWorkTree(ctx.workTree, append([]string{"add", "--"}, stagePaths...))
	resp := map[string]any{"ok": result.Code == 0, "workTree": ctx.workTree}
	mergeGitResult(resp, result)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleClone(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	url := strings.TrimSpace(bodyStr(body, "url"))
	if url == "" {
		errJSON(w, http.StatusBadRequest, "Укажите URL репозитория (https, git@, ssh://…)")
		return
	}
	if len(url) > 2048 {
		errJSON(w, http.StatusBadRequest, "URL слишком длинный")
		return
	}
	dirName := strings.TrimSpace(bodyStr(body, "directory"))
	if dirName == "" {
		dirName = strings.TrimSpace(bodyStr(body, "workFolder"))
	}
	abs, rel, err := s.resolveWorkTreeDir(dirName)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if st, statErr := os.Stat(abs); statErr == nil {
		if !st.IsDir() {
			errJSON(w, http.StatusBadRequest, "Путь уже существует и это не каталог: "+rel)
			return
		}
		entries, _ := os.ReadDir(abs)
		if len(entries) > 0 {
			errJSON(w, http.StatusBadRequest, "Каталог не пуст: "+rel+". Укажите другое имя или удалите содержимое.")
			return
		}
	}

	cloneURL := url
	usedPat := false
	applied, e := applyHTTPSPat(url, bodyStr(body, "pat"), bodyStr(body, "patUsername"))
	if e != nil {
		errJSON(w, http.StatusBadRequest, e.Error())
		return
	}
	cloneURL = applied.cloneURL
	usedPat = applied.usedPat

	args := []string{"clone"}
	if bodyTrue(body, "depth") {
		args = append(args, "--depth", "1")
	}
	args = append(args, cloneURL, rel)
	repoRoot := s.RepoRoot()
	result := runGitInWorkTree(repoRoot, args)
	exitCode := result.Code

	originSanitized := false
	if exitCode == 0 && usedPat {
		clean := httpsURLWithoutCredentials(url)
		workTree := filepath.Join(repoRoot, filepath.FromSlash(rel))
		setR := runGitInWorkTree(workTree, []string{"remote", "set-url", "origin", clean})
		originSanitized = setR.Code == 0
	}

	var modelPath any
	var modelLayout any
	if exitCode == 0 {
		clonedRoot := filepath.Join(repoRoot, filepath.FromSlash(rel))
		if entry := findModelEntryUnder(clonedRoot); entry != nil {
			if mp, relErr := filepath.Rel(repoRoot, entry.absPath); relErr == nil {
				modelPath = filepath.ToSlash(mp)
				modelLayout = string(entry.layout)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              exitCode == 0,
		"path":            rel,
		"stdout":          result.Stdout,
		"stderr":          result.Stderr,
		"code":            exitCode,
		"originSanitized": originSanitized,
		"modelPath":       modelPath,
		"modelLayout":     modelLayout,
	})
}

func (s *Server) handleCommit(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	message := strings.TrimSpace(bodyStr(body, "message"))
	if message == "" {
		errJSON(w, http.StatusBadRequest, "Нужно сообщение коммита")
		return
	}
	ctx, err := s.resolveModelGitContext(bodyStr(body, "path"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	stagePaths := resolveGitStagePaths(ctx.relInWorkTree)
	addResult := runGitInWorkTree(ctx.workTree, append([]string{"add", "--"}, stagePaths...))
	if addResult.Code != 0 {
		resp := map[string]any{
			"ok":         false,
			"step":       "add",
			"workTree":   ctx.workTree,
			"stagePaths": stagePaths,
			"error":      firstNonEmpty(strings.TrimSpace(addResult.Stderr), strings.TrimSpace(addResult.Stdout), "git add failed"),
		}
		mergeGitResult(resp, addResult)
		writeJSON(w, http.StatusBadRequest, resp)
		return
	}
	commitResult := runGitInWorkTree(ctx.workTree, []string{"commit", "-m", message})
	if commitResult.Code != 0 {
		stderr := firstNonEmpty(strings.TrimSpace(commitResult.Stderr), strings.TrimSpace(commitResult.Stdout))
		hint := ""
		if reNothingToCommit.MatchString(stderr) {
			hint = " Сначала нажмите «Сохранить модель», затем коммит. Для split-модели в коммит попадает весь каталог model/."
		}
		errText := "git commit failed" + hint
		if stderr != "" {
			errText = stderr + hint
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok":         false,
			"step":       "commit",
			"workTree":   ctx.workTree,
			"stagePaths": stagePaths,
			"error":      errText,
			"add":        addResult,
			"commit":     commitResult,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"workTree":   ctx.workTree,
		"stagePaths": stagePaths,
		"add":        addResult,
		"commit":     commitResult,
	})
}

func (s *Server) handlePushPull(w http.ResponseWriter, r *http.Request, isPull bool) {
	body := readBody(r)
	workTree := s.resolveConfiguredWorkTree(bodyStr(body, "path"), bodyStr(body, "workFolder"))
	remote, err := safeRemoteName(firstNonEmpty(bodyStr(body, "remote"), "origin"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	pat := strings.TrimSpace(bodyStr(body, "pat"))

	var transferArgs []string
	resultKey := "push"
	if isPull {
		resultKey = "pull"
		branchInput := strings.TrimSpace(bodyStr(body, "branch"))
		if branchInput == "" {
			branchInput = "main"
		}
		branch, e := safeBranchRef(branchInput)
		if e != nil {
			errJSON(w, http.StatusBadRequest, e.Error())
			return
		}
		transferArgs = []string{"pull", remote, branch}
	} else {
		branch, e := safeBranchRef(bodyStr(body, "branch"))
		if e != nil {
			errJSON(w, http.StatusBadRequest, e.Error())
			return
		}
		transferArgs = []string{"push"}
		if bodyTrue(body, "setUpstream") {
			transferArgs = append(transferArgs, "-u")
		}
		transferArgs = append(transferArgs, remote)
		if branch != "" {
			transferArgs = append(transferArgs, branch)
		}
	}

	if pat == "" {
		result := runGitInWorkTree(workTree, transferArgs)
		writeJSON(w, http.StatusOK, map[string]any{"ok": result.Code == 0, "workTree": workTree, resultKey: result})
		return
	}

	gr := runGitInWorkTree(workTree, []string{"remote", "get-url", remote})
	if gr.Code != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok":           false,
			"error":        firstNonEmpty(strings.TrimSpace(gr.Stderr), strings.TrimSpace(gr.Stdout), "Не удалось прочитать URL remote"),
			"workTree":     workTree,
			"remoteGetUrl": gr,
		})
		return
	}
	remoteURL := strings.TrimSpace(gr.Stdout)
	applied, e := applyHTTPSPat(remoteURL, pat, bodyStr(body, "patUsername"))
	if e != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": e.Error(), "workTree": workTree})
		return
	}
	if !applied.usedPat {
		label := "Укажите PAT для HTTPS push"
		if isPull {
			label = "Укажите PAT для HTTPS pull"
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": label, "workTree": workTree})
		return
	}
	restoreURL := httpsURLWithoutCredentials(remoteURL)
	setPat := runGitInWorkTree(workTree, []string{"remote", "set-url", remote, applied.cloneURL})
	if setPat.Code != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok":           false,
			"error":        firstNonEmpty(strings.TrimSpace(setPat.Stderr), "Не удалось временно задать URL с PAT"),
			"workTree":     workTree,
			"remoteSetUrl": setPat,
		})
		return
	}
	result := runGitInWorkTree(workTree, transferArgs)
	restore := runGitInWorkTree(workTree, []string{"remote", "set-url", remote, restoreURL})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              result.Code == 0,
		"workTree":        workTree,
		resultKey:         result,
		"originSanitized": restore.Code == 0,
		"restoreRemote":   restore,
	})
}

func (s *Server) handleBranches(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	workTree := s.resolveConfiguredWorkTree(bodyStr(body, "path"), bodyStr(body, "workFolder"))
	if !pathExists(filepath.Join(workTree, ".git")) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "branches": []any{}, "workTree": workTree})
		return
	}
	doFetch := bodyTrue(body, "fetch")
	remote, err := safeRemoteName(firstNonEmpty(bodyStr(body, "remote"), "origin"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	pat := strings.TrimSpace(bodyStr(body, "pat"))
	var fetchResult gitResult
	fetchRan := false
	if doFetch {
		fetchRan = true
		if pat == "" {
			fetchResult = runGitInWorkTree(workTree, []string{"fetch", "--prune", remote})
		} else if gr := runGitInWorkTree(workTree, []string{"remote", "get-url", remote}); gr.Code == 0 {
			remoteURL := strings.TrimSpace(gr.Stdout)
			if applied, e := applyHTTPSPat(remoteURL, pat, bodyStr(body, "patUsername")); e == nil && applied.usedPat {
				restoreURL := httpsURLWithoutCredentials(remoteURL)
				if setPat := runGitInWorkTree(workTree, []string{"remote", "set-url", remote, applied.cloneURL}); setPat.Code == 0 {
					fetchResult = runGitInWorkTree(workTree, []string{"fetch", "--prune", remote})
					runGitInWorkTree(workTree, []string{"remote", "set-url", remote, restoreURL})
				}
			}
		}
	}
	res := runGitInWorkTree(workTree, []string{
		"for-each-ref", "--sort=refname",
		"--format=%(HEAD)\t%(refname:short)\t%(refname)",
		"refs/heads", "refs/remotes",
	})
	if res.Code != 0 {
		resp := map[string]any{
			"ok":       false,
			"error":    firstNonEmpty(strings.TrimSpace(res.Stderr), "Не удалось получить список веток"),
			"workTree": workTree,
		}
		if fetchRan {
			resp["fetch"] = fetchResult
		}
		writeJSON(w, http.StatusBadRequest, resp)
		return
	}
	branches := []any{}
	seen := map[string]bool{}
	for _, line := range strings.Split(res.Stdout, "\n") {
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
		if shortName == "" || seen[shortName] || reControlChars.MatchString(shortName) {
			continue
		}
		seen[shortName] = true
		branches = append(branches, map[string]any{
			"name":    shortName,
			"current": strings.TrimSpace(parts[0]) == "*",
			"local":   strings.HasPrefix(full, "refs/heads/"),
		})
	}
	resp := map[string]any{"ok": true, "branches": branches, "workTree": workTree}
	if fetchRan {
		resp["fetch"] = fetchResult
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleCheckout(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	workTree := s.resolveConfiguredWorkTree(bodyStr(body, "path"), bodyStr(body, "workFolder"))
	branch, err := safeCheckoutTarget(bodyStr(body, "branch"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	createBranch := bodyTrue(body, "createBranch")
	startPoint := ""
	if sp := strings.TrimSpace(bodyStr(body, "startPoint")); sp != "" {
		startPoint, err = safeCheckoutTarget(sp)
		if err != nil {
			errJSON(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	var args []string
	checkoutMode := "checkout"
	if createBranch {
		args = []string{"checkout", "-b", branch}
		if startPoint != "" {
			args = append(args, startPoint)
		}
	} else {
		branchForRemote := branch
		if reHeadSuffix.MatchString(branchForRemote) {
			if symHead := runGitInWorkTree(workTree, []string{"symbolic-ref", "-q", "refs/remotes/" + branchForRemote}); symHead.Code == 0 {
				short := strings.TrimPrefix(strings.TrimSpace(symHead.Stdout), "refs/remotes/")
				if short != "" && !reHeadSuffix.MatchString(short) {
					branchForRemote = short
				}
			}
		}
		remoteRefOk := runGitInWorkTree(workTree, []string{"rev-parse", "--verify", "--quiet", "refs/remotes/" + branchForRemote})
		if remoteRefOk.Code == 0 {
			localBranch := branchForRemote
			if idx := strings.Index(branchForRemote, "/"); idx >= 0 {
				localBranch = branchForRemote[idx+1:]
			}
			headish := strings.ToLower(localBranch) == "head" || localBranch == ""
			if headish {
				args = []string{"checkout", branchForRemote}
			} else {
				args = []string{"checkout", "-B", localBranch, branchForRemote}
				checkoutMode = "checkout-attached-from-remote"
			}
		} else {
			args = []string{"checkout", branch}
		}
	}

	result := runGitInWorkTree(workTree, args)
	currentBranch := ""
	if result.Code == 0 {
		if sym := runGitInWorkTree(workTree, []string{"symbolic-ref", "--short", "-q", "HEAD"}); sym.Code == 0 {
			currentBranch = strings.TrimSpace(sym.Stdout)
		}
	}
	resp := map[string]any{
		"ok":           result.Code == 0,
		"workTree":     workTree,
		"checkout":     result,
		"checkoutMode": checkoutMode,
	}
	if currentBranch != "" {
		resp["currentBranch"] = currentBranch
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleDeleteRepository(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	workFolderIn := strings.TrimSpace(bodyStr(body, "workFolder"))
	abs, rel, err := s.resolveWorkTreeDir(workFolderIn)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	relFromRoot, e := filepath.Rel(s.RepoRoot(), abs)
	if e != nil || strings.HasPrefix(relFromRoot, "..") {
		errJSON(w, http.StatusBadRequest, "Некорректный путь к репозиторию")
		return
	}
	if !pathExists(abs) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": false, "rel": rel, "message": "Каталог «" + rel + "» отсутствует."})
		return
	}
	st, statErr := os.Stat(abs)
	if statErr != nil || !st.IsDir() {
		errJSON(w, http.StatusBadRequest, "Путь не является каталогом")
		return
	}
	if !pathExists(filepath.Join(abs, ".git")) {
		errJSON(w, http.StatusBadRequest, "В каталоге «"+rel+"» нет .git — удаление отменено.")
		return
	}
	if relFromRoot == "." {
		entries, readErr := os.ReadDir(abs)
		if readErr != nil {
			errJSON(w, http.StatusBadRequest, readErr.Error())
			return
		}
		for _, entry := range entries {
			if err := os.RemoveAll(filepath.Join(abs, entry.Name())); err != nil {
				errJSON(w, http.StatusBadRequest, err.Error())
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": true, "rel": rel})
		return
	}
	if err := os.RemoveAll(abs); err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": true, "rel": rel})
}

func (s *Server) handleModelRead(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	abs, rel, err := s.resolveAllowedModelPath(bodyStr(body, "path"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	content, readErr := os.ReadFile(abs)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			errJSON(w, http.StatusNotFound, "Файл не найден")
			return
		}
		errJSON(w, http.StatusBadRequest, readErr.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": rel, "content": string(content), "layout": "single-file"})
}

func (s *Server) handleModelDelete(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	abs, rel, err := s.resolveAllowedModelPath(bodyStr(body, "path"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := os.Remove(abs); err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": rel, "deleted": false})
			return
		}
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": rel, "deleted": true})
}

func (s *Server) handleModelWrite(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	abs, rel, err := s.resolveAllowedModelPath(bodyStr(body, "path"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	contentVal, ok := body["content"]
	content, isStr := contentVal.(string)
	if !ok || !isStr {
		errJSON(w, http.StatusBadRequest, "Нужно содержимое XML (строка)")
		return
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": rel})
}

func (s *Server) handleModelReadSplitIndex(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	pathInput := strings.TrimSpace(bodyStr(body, "path"))
	if pathInput == "" {
		errJSON(w, http.StatusBadRequest, "Укажите путь к model/folder.xml")
		return
	}
	abs, rel, err := s.resolveAllowedModelPath(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	manifestBytes, readErr := os.ReadFile(abs)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			errJSON(w, http.StatusNotFound, "Файл или каталог модели не найден")
			return
		}
		errJSON(w, http.StatusBadRequest, readErr.Error())
		return
	}
	if !isSplitModelManifestContent(string(manifestBytes)) {
		errJSON(w, http.StatusBadRequest, "Указанный файл не является корнем split-модели (ArchimateModel).")
		return
	}
	smr, err := s.resolveSplitModelRootFromManifestPath(rel)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	indexModel, err := buildSplitModelIndex(smr.modelRootAbs)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	parsedModel := indexModel.serialize(smr.modelRoot, rel)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"layout":       "split-files",
		"path":         rel,
		"manifestPath": rel,
		"modelRoot":    smr.modelRoot,
		"elementCount": len(indexModel.Elements),
		"diagramCount": len(indexModel.Diagrams),
		"parsedModel":  parsedModel,
	})
}

func (s *Server) handleModelReadSplitFile(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	modelRoot := strings.TrimSpace(bodyStr(body, "modelRoot"))
	relativePath := strings.TrimSpace(bodyStr(body, "relativePath"))
	if modelRoot == "" || relativePath == "" {
		errJSON(w, http.StatusBadRequest, "Укажите modelRoot и relativePath")
		return
	}
	abs, rel, err := s.resolveSplitModelFilePath(modelRoot, relativePath)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	content, readErr := os.ReadFile(abs)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			errJSON(w, http.StatusNotFound, "Файл не найден")
			return
		}
		errJSON(w, http.StatusBadRequest, readErr.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "modelRoot": modelRoot, "relativePath": rel, "content": string(content)})
}

func (s *Server) handleModelReadSplit(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	pathInput := strings.TrimSpace(bodyStr(body, "path"))
	if pathInput == "" {
		errJSON(w, http.StatusBadRequest, "Укажите путь к model/folder.xml")
		return
	}
	abs, rel, err := s.resolveAllowedModelPath(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	manifestBytes, readErr := os.ReadFile(abs)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			errJSON(w, http.StatusNotFound, "Файл или каталог модели не найден")
			return
		}
		errJSON(w, http.StatusBadRequest, readErr.Error())
		return
	}
	manifest := string(manifestBytes)
	if !isSplitModelManifestContent(manifest) {
		errJSON(w, http.StatusBadRequest, "Указанный файл не является корнем split-модели (ArchimateModel).")
		return
	}
	modelRootAbs := filepath.Dir(abs)
	modelRoot, relErr := filepath.Rel(s.RepoRoot(), modelRootAbs)
	if relErr != nil {
		errJSON(w, http.StatusBadRequest, relErr.Error())
		return
	}
	modelRoot = filepath.ToSlash(modelRoot)
	if strings.HasPrefix(modelRoot, "..") || filepath.IsAbs(modelRoot) {
		errJSON(w, http.StatusBadRequest, "Путь выходит за пределы GIT_REPO_ROOT")
		return
	}
	files, _ := collectSplitModelXmlFiles(modelRootAbs)
	parsedModel, parseErr := parseSplitModel(modelRoot, rel, manifest, files)
	if parseErr != nil {
		errJSON(w, http.StatusBadRequest, parseErr.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"layout":       "split-files",
		"path":         rel,
		"manifestPath": rel,
		"modelRoot":    modelRoot,
		"fileCount":    len(files),
		"parsedModel":  parsedModel,
	})
}

func (s *Server) handleGitReadSplitIndex(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	pathInput := strings.TrimSpace(bodyStr(body, "path"))
	ref, err := safeBranchRef(bodyStr(body, "ref"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if pathInput == "" {
		errJSON(w, http.StatusBadRequest, "Укажите путь к model/folder.xml")
		return
	}
	if ref == "" {
		errJSON(w, http.StatusBadRequest, "Укажите ref (ветку) для сравнения")
		return
	}
	ctx, err := s.resolveModelGitContext(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	manifest, err := readRepoFileAtRef(ctx.workTree, ref, ctx.relInWorkTree)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if !isSplitModelManifestContent(manifest) {
		errJSON(w, http.StatusBadRequest, "Указанный файл не является корнем split-модели (ArchimateModel).")
		return
	}
	_, manifestRel, err := s.resolveAllowedModelPath(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	smr, err := s.resolveSplitModelRootFromManifestPath(manifestRel)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	modelRootInWorkTree := dirnamePosix(ctx.relInWorkTree)
	relativePaths, err := listSplitModelXmlPathsAtRef(ctx.workTree, ref, modelRootInWorkTree)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	indexModel, err := buildSplitModelIndexFromRelativePaths(relativePaths, func(rp string) (string, error) {
		gitPath := strings.ReplaceAll(modelRootInWorkTree+"/"+rp, "\\", "/")
		return readRepoFileAtRef(ctx.workTree, ref, gitPath)
	})
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	parsedModel := indexModel.serialize(smr.modelRoot, manifestRel)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"layout":       "split-files",
		"ref":          ref,
		"path":         manifestRel,
		"manifestPath": manifestRel,
		"modelRoot":    smr.modelRoot,
		"parsedModel":  parsedModel,
	})
}

func (s *Server) handleGitReadSplitCompareBundle(w http.ResponseWriter, r *http.Request) {
	body := readBody(r)
	pathInput := strings.TrimSpace(bodyStr(body, "path"))
	ref, err := safeBranchRef(bodyStr(body, "ref"))
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	diagramSourceFile := strings.ReplaceAll(strings.TrimLeft(strings.TrimSpace(bodyStr(body, "diagramSourceFile")), "\\/"), "\\", "/")
	if pathInput == "" {
		errJSON(w, http.StatusBadRequest, "Укажите путь к model/folder.xml")
		return
	}
	if ref == "" {
		errJSON(w, http.StatusBadRequest, "Укажите ref (ветку) для сравнения")
		return
	}
	if diagramSourceFile == "" {
		errJSON(w, http.StatusBadRequest, "Укажите diagramSourceFile")
		return
	}
	ctx, err := s.resolveModelGitContext(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	manifest, err := readRepoFileAtRef(ctx.workTree, ref, ctx.relInWorkTree)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	if !isSplitModelManifestContent(manifest) {
		errJSON(w, http.StatusBadRequest, "Указанный файл не является корнем split-модели (ArchimateModel).")
		return
	}
	_, manifestRel, err := s.resolveAllowedModelPath(pathInput)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	smr, err := s.resolveSplitModelRootFromManifestPath(manifestRel)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	modelRootInWorkTree := dirnamePosix(ctx.relInWorkTree)
	modelRelativePaths, err := listSplitModelXmlPathsAtRef(ctx.workTree, ref, modelRootInWorkTree)
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	bundle, err := buildSplitCompareBundle(modelRootInWorkTree, diagramSourceFile, modelRelativePaths, func(gitPath string) (string, error) {
		return readRepoFileAtRef(ctx.workTree, ref, gitPath)
	})
	if err != nil {
		errJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"layout":        "split-files",
		"ref":           ref,
		"path":          manifestRel,
		"manifestPath":  manifestRel,
		"modelRoot":     smr.modelRoot,
		"diagram":       bundle.Diagram,
		"elements":      bundle.Elements,
		"relationships": bundle.Relationships,
	})
}
