package apiserver

import "testing"

func TestListGitBranchesUsesLocalNames(t *testing.T) {
	dir := initTestRepoWithRemoteMain(t)
	runGitInWorkTree(dir, []string{"update-ref", "refs/remotes/origin/master", "HEAD"})

	branches, err := listGitBranches(dir, "origin")
	if err != nil {
		t.Fatalf("listGitBranches: %v", err)
	}
	for _, entry := range branches {
		name, _ := entry["name"].(string)
		if name == "origin/main" || name == "origin/master" {
			t.Fatalf("unexpected remote-prefixed branch name: %q", name)
		}
	}
	hasMain := false
	for _, entry := range branches {
		if entry["name"] == "main" {
			hasMain = true
			break
		}
	}
	if !hasMain {
		t.Fatalf("expected local branch main in %#v", branches)
	}
}

func TestGitResolveRemoteBranchRef(t *testing.T) {
	dir := initTestRepoWithRemoteMain(t)
	if got := gitResolveRemoteBranchRef(dir, "origin", "main"); got != "origin/main" {
		t.Fatalf("gitResolveRemoteBranchRef() = %q, want origin/main", got)
	}
	if got := gitResolveRemoteBranchRef(dir, "origin", "origin/main"); got != "origin/main" {
		t.Fatalf("gitResolveRemoteBranchRef() = %q, want origin/main", got)
	}
}
