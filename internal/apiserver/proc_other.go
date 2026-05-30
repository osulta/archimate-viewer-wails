//go:build !windows

package apiserver

import "os/exec"

// hideConsoleWindow is a no-op on non-Windows platforms, where running git does
// not spawn a visible console window.
func hideConsoleWindow(_ *exec.Cmd) {}
