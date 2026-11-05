# King Terminal PTY helper: allocates a real pseudo-terminal (Linux/macOS) for a shell.
# fd0 = input to the shell, fd1 = shell output, fd3 = control channel ("R <cols> <rows>\n").
import os, pty, sys, select, struct, fcntl, termios, signal

def set_size(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

def main():
    cols, rows = int(sys.argv[1]), int(sys.argv[2])
    argv = sys.argv[3:]
    pid, master = pty.fork()
    if pid == 0:
        os.execvp(argv[0], argv)
    set_size(master, cols, rows)
    buf = b""
    stdin_open = True
    while True:
        rl = [master, 3] + ([0] if stdin_open else [])
        try:
            r, _, _ = select.select(rl, [], [], 0.5)
        except InterruptedError:
            continue
        if master in r:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
        if 0 in r:
            data = os.read(0, 65536)
            if not data:
                stdin_open = False
            else:
                os.write(master, data)
        if 3 in r:
            data = os.read(3, 4096)
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                p = line.split()
                if len(p) == 3 and p[0] == b"R":
                    try:
                        set_size(master, int(p[1]), int(p[2]))
                        os.kill(pid, signal.SIGWINCH)
                    except Exception:
                        pass
        try:
            done, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if done:
            try:
                while True:
                    d = os.read(master, 65536)
                    if not d: break
                    os.write(1, d)
            except OSError:
                pass
            sys.exit(os.waitstatus_to_exitcode(status))
    try:
        _, status = os.waitpid(pid, 0)
        sys.exit(os.waitstatus_to_exitcode(status))
    except ChildProcessError:
        sys.exit(0)

main()
