package apiserver

import "testing"

func initTestRepoWithRemoteMain(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	initRepo := runGitInWorkTree(dir, []string{"init", "-b", "main"})
	if initRepo.Code != 0 {
		t.Fatalf("git init failed: %s", initRepo.Stderr)
	}
	commit := runGitInWorkTree(dir, []string{"commit", "--allow-empty", "-m", "init"})
	if commit.Code != 0 {
		t.Fatalf("git commit failed: %s", commit.Stderr)
	}
	runGitInWorkTree(dir, []string{"remote", "add", "origin", dir})
	updateRef := runGitInWorkTree(dir, []string{"update-ref", "refs/remotes/origin/main", "HEAD"})
	if updateRef.Code != 0 {
		t.Fatalf("update-ref failed: %s", updateRef.Stderr)
	}
	return dir
}

func TestResolveGitPullArgsPrefersLocalBranchOverStaleHint(t *testing.T) {
	dir := initTestRepoWithRemoteMain(t)
	// Stale remote-tracking ref for a deleted remote branch.
	runGitInWorkTree(dir, []string{"update-ref", "refs/remotes/origin/master", "HEAD"})

	args, branch, err := resolveGitPullArgs(dir, "origin", "master")
	if err != nil {
		t.Fatalf("resolveGitPullArgs: %v", err)
	}
	if branch != "main" {
		t.Fatalf("branch = %q, want main", branch)
	}
	if len(args) != 3 || args[0] != "pull" || args[1] != "origin" || args[2] != "main" {
		t.Fatalf("resolveGitPullArgs() = %#v, want pull origin main", args)
	}
}

func TestResolveGitPullArgsIgnoresMissingRemoteTrackingRef(t *testing.T) {
	dir := initTestRepoWithRemoteMain(t)
	// Simulate fetch --prune: no remote-tracking refs left.
	runGitInWorkTree(dir, []string{"update-ref", "-d", "refs/remotes/origin/main"})

	_, _, err := resolveGitPullArgs(dir, "origin", "master")
	if err == nil {
		t.Fatal("expected error when remote-tracking ref is missing")
	}
}
