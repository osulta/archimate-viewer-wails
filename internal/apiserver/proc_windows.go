//go:build windows

package apiserver

import (
	"os/exec"
	"syscall"
)

// createNoWindow is the Windows CREATE_NO_WINDOW process creation flag. It runs
// the child process without allocating a console, so spawning git does not flash
// a command-prompt window in the desktop app.
const createNoWindow = 0x08000000

// hideConsoleWindow configures the command so no console window appears on Windows.
func hideConsoleWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNoWindow
}
