#!/usr/bin/env python3
"""ak-console.py — non-interactive UART bridge for the AK base kit console.

Built for AI agents (and humans) to capture logs and drive the AK shell in one
shot, with bounded timeouts and clean output: everything the BOARD prints goes
to stdout; everything THIS SCRIPT says goes to stderr.

Requires:  sudo apt install python3-serial

Examples:
  python ak-console.py --list
  python ak-console.py --port COM3 --watch 10
  python ak-console.py --port /dev/ttyUSB0 --cmd "ver" --cmd "fatal l"
  python ak-console.py --port COM3 --key f              # fatal-mode single key
  python ak-console.py --port COM3 --cmd "reboot" --allow-destructive

Safety: shell commands with side effects (reboot, fatal t/!/@/r, ram r, eps r,
flash i, boot r/t, fwu, psv, dbg s) are refused unless --allow-destructive is
given, so an autonomous agent cannot brick or reset the board by accident.
"""

import argparse
import sys
import time

BAUD_DEFAULT = 115200
IDLE_GAP_S = 0.7          # response considered complete after this much silence
FIRST_BYTE_TIMEOUT_S = 3.0  # max wait for the first byte of a response

# (command, option) pairs with side effects. Option None = any/no option.
DESTRUCTIVE = {
    ("reboot", None),
    ("fwu", None),
    ("psv", None),
    ("fatal", "t"), ("fatal", "!"), ("fatal", "@"), ("fatal", "r"),
    ("ram", "r"),
    ("eps", "r"),
    ("flash", "i"),
    ("boot", "r"), ("boot", "t"),
    ("dbg", "s"),
}


def eprint(*args):
    print(*args, file=sys.stderr, flush=True)


def die(msg, code=2):
    eprint(f"ak-console: error: {msg}")
    sys.exit(code)


def load_serial():
    try:
        import serial  # noqa: F401
        import serial.tools.list_ports  # noqa: F401
        return serial
    except ImportError:
        die("pyserial is not installed. Fix:  pip install pyserial")


def list_ports(serial_mod):
    ports = list(serial_mod.tools.list_ports.comports())
    if not ports:
        eprint("no serial ports found")
        return
    for p in ports:
        print(f"{p.device}\t{p.description}")


def is_destructive(cmd_line):
    parts = cmd_line.strip().split()
    if not parts:
        return False
    name = parts[0].lower()
    opt = parts[1].lower() if len(parts) > 1 else None
    if (name, None) in DESTRUCTIVE:
        return True
    return (name, opt) in DESTRUCTIVE


def read_until_idle(ser, overall_deadline):
    """Read bytes until the line goes quiet (IDLE_GAP_S) or deadline passes."""
    buf = bytearray()
    last_rx = time.monotonic()
    got_any = False
    while True:
        now = time.monotonic()
        if now >= overall_deadline:
            break
        chunk = ser.read(256)  # ser.timeout paces this loop
        if chunk:
            buf += chunk
            last_rx = time.monotonic()
            got_any = True
        else:
            gap = IDLE_GAP_S if got_any else FIRST_BYTE_TIMEOUT_S
            if time.monotonic() - last_rx >= gap:
                break
    return bytes(buf)


def emit(data):
    text = data.decode("utf-8", errors="replace")
    sys.stdout.write(text)
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser(
        description="Non-interactive UART bridge for the AK base kit console (115200 8N1).",
        epilog="Board output -> stdout; script messages -> stderr.",
    )
    ap.add_argument("--list", action="store_true", help="list serial ports and exit")
    ap.add_argument("--port", help="serial port, e.g. COM3 or /dev/ttyUSB0")
    ap.add_argument("--baud", type=int, default=BAUD_DEFAULT, help=f"baud rate (default {BAUD_DEFAULT})")
    ap.add_argument("--cmd", action="append", default=[],
                    help='shell command to send, repeatable: --cmd "ver" --cmd "fatal l"')
    ap.add_argument("--key", action="append", default=[],
                    help="single key to send without CR (fatal mode: f/m/e/R/c/s/r), repeatable")
    ap.add_argument("--watch", type=float, default=0,
                    help="listen for N seconds (capture boot/live logs)")
    ap.add_argument("--wait", type=float, default=15,
                    help="max seconds to wait per command response (default 15)")
    ap.add_argument("--allow-destructive", action="store_true",
                    help="permit commands with side effects (reboot, fwu, fatal t, ...)")
    args = ap.parse_args()

    if not args.list:
        if not args.port:
            die("--port is required (use --list to discover ports)")
        if not (args.cmd or args.key or args.watch):
            die("nothing to do: give --cmd, --key, and/or --watch")

    # Safety gate — pure logic, runs before any dependency or port is touched.
    for c in args.cmd:
        if is_destructive(c) and not args.allow_destructive:
            die(f'command "{c}" has side effects; re-run with --allow-destructive '
                f"only after the engineer confirms", code=3)
    for k in args.key:
        if k == "r" and not args.allow_destructive:
            die('key "r" resets the board (fatal mode); re-run with --allow-destructive', code=3)

    serial_mod = load_serial()

    if args.list:
        list_ports(serial_mod)
        return

    try:
        ser = serial_mod.Serial(port=args.port, baudrate=args.baud, timeout=0.1)
    except Exception as exc:  # SerialException, PermissionError, ...
        die(f"cannot open {args.port}: {exc}")

    try:
        if args.watch > 0:
            eprint(f"# watching {args.port} @ {args.baud} for {args.watch:.0f}s")
            deadline = time.monotonic() + args.watch
            while time.monotonic() < deadline:
                chunk = ser.read(256)
                if chunk:
                    emit(chunk)
            eprint("# watch done")

        for key in args.key:
            eprint(f"# key: {key}")
            ser.reset_input_buffer()
            ser.write(key.encode("ascii"))
            emit(read_until_idle(ser, time.monotonic() + args.wait))

        for cmd in args.cmd:
            eprint(f"# cmd: {cmd}")
            ser.reset_input_buffer()
            ser.write(cmd.encode("ascii") + b"\r")
            emit(read_until_idle(ser, time.monotonic() + args.wait))
            print()  # separate command outputs
    finally:
        ser.close()


if __name__ == "__main__":
    main()
