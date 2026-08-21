#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Break the things check_maia_voice.mjs guards, and watch it go red.

WHY THIS FILE EXISTS. check_maia_voice.mjs was written and printed ALL GREEN on
its first run. That is exactly what it would have printed if its extractor had
matched nothing at all, and this round has already paid for that lesson seven
times. So the green is worth nothing until each half of the gate has been
broken on purpose and seen to fail.

TWO HALVES, BROKEN SEPARATELY, and that separation is the whole design. A gate
like this can fail in two completely different ways and only one of them is the
obvious one:

  THE RULES. Plant a real violation in a line Maia says and the house rules
  must catch it. Mutations 1 to 3.

  THE EXTRACTOR. Take the copy away from the gate without changing a single
  word of it, and the gate must go RED rather than silently clean. Mutations 4
  to 6 rename the declaration, rename the call sites, and move a sentinel. A
  gate that passes these while extracting nothing is the silent-zero defect
  wearing a green shirt.

WHY NO MUTATION TOUCHES A SENTINEL LINE. The extraction guards run BEFORE the
rules and exit early, by design: there is no point rule-checking a payload you
cannot trust. So planting an em-dash in a sentinel would prove nothing about
the em-dash rule, it would just trip the sentinel guard first. Each mutation
below targets a line no other mutation and no sentinel depends on. That was
found by writing it the wrong way round first.

WHAT COUNTS AS A PROOF. Four things, and any one alone is worthless:
  1. the CONTROL is green AND reports a non-zero extraction count
  2. the mutation actually applied  (anchor found the expected number of times)
  3. the mutant run exits NON-ZERO
  4. the expected signal appears in its output

  cd docs/prototypes/qa && python3 break_maia_voice.py
"""
import io, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "grounds-v0.html")
GATE = os.path.join(HERE, "check_maia_voice.mjs")

SRC = io.open(ART, encoding="utf-8").read()

# Somewhere real on C:, never /tmp. This gate reads a file rather than serving
# one, but the lane's convention is one staging rule for every breaker.
STAGE = os.path.join(os.environ.get("LOCALAPPDATA", tempfile.gettempdir()),
                     "amora-maia-voice-breaks")

# name, (find, replace, expected_occurrences), signal that MUST appear, half
BREAKS = [
    ("an em-dash in a resident line",
     ("Herons moved in within a month",
      "Herons moved in — within a month", 1),
     "[em-dash]", "rules"),

    # "vibrant" and not "seamlessly", and the difference is the rule rather
    # than a preference. check-voice matches each banned word with a
    # `(?![a-z])` lookahead, so "seamlessly" does not trip "seamless". The
    # first draft of this mutation planted the adverb, read the resulting
    # green as a hole in the gate, and was wrong about which of the two was
    # broken. A mutation that does not actually violate the rule proves
    # nothing except that the mutation was bad.
    ("an AI word in a resident line",
     ("The greenhouse feeds us.",
      "The greenhouse is a vibrant place.", 1),
     "[ai-word]", "rules"),

    ("a contrast frame in a resident line",
     ("We have no bosses.",
      "We are not bosses, but circles.", 1),
     "[contrast-frame]", "rules"),

    ("her resident lines are renamed out from under the gate",
     ("const MAIA_STOPS={", "const MAIA_LINES={", 1),
     "MAIA_STOPS has 0 entries", "extractor"),

    ("every call site is renamed, so the gate reads almost nothing",
     ("maiaSay(", "maiaSayX(", None),
     "copy rows, expected at least", "extractor"),

    # Two copies: her resident line, and the Welcome Walk seed beside it. The
    # sentinel guard has to survive BOTH moving, so this replaces both.
    ("a sentinel line quietly moves",
     ("We never pay each other to care.",
      "We keep that one between us.", 2),
     "sentinel line missing", "extractor"),
]


def run(path):
    """Run the gate at one artifact. Returns (exit_code, combined_output)."""
    p = subprocess.run([node(), GATE, path], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def node():
    return os.environ.get("NODE_BIN", "node")


def main():
    os.makedirs(STAGE, exist_ok=True)

    # ---------------------------------------------------------- the control
    print("CONTROL: the artifact as it stands")
    rc, out = run(ART)
    ctl = [l for l in out.splitlines() if l.startswith("extracted:")]
    print("  " + (ctl[0] if ctl else "(no extraction line!)"))
    if rc != 0:
        print("  the control is already RED. Fix that before trusting any mutation:")
        print("  " + "\n  ".join(out.splitlines()[:12]))
        return 1
    if not ctl:
        print("  ABORT: the control printed no extraction count, so there is no")
        print("         non-zero baseline to compare a mutant against.")
        return 1
    base = int(ctl[0].split()[1])
    if base <= 0:
        print("  ABORT: the control extracted %d rows. A gate over an empty payload" % base)
        print("         prints the same green as a gate over a clean one.")
        return 1
    print("  control is GREEN over %d rows. Every mutation below must go red.\n" % base)

    # -------------------------------------------------------- the mutations
    passed = failed = 0
    for name, (find, repl, want_n), signal, half in BREAKS:
        n = SRC.count(find)
        if want_n is not None and n != want_n:
            print("SKIP  %-58s anchor found %d times, expected %d" % (name, n, want_n))
            failed += 1
            continue
        if n == 0:
            print("SKIP  %-58s anchor not found at all" % name)
            failed += 1
            continue
        mutant = SRC.replace(find, repl) if want_n is None else SRC.replace(find, repl, 1)
        if mutant == SRC:
            print("SKIP  %-58s mutation did not change the file" % name)
            failed += 1
            continue

        path = os.path.join(STAGE, "grounds-v0.html")
        io.open(path, "w", encoding="utf-8", newline="").write(mutant)
        rc, out = run(path)

        got = signal in out
        if rc != 0 and got:
            print("RED   %-58s [%s] %s" % (name, half, signal))
            passed += 1
        else:
            print("GREEN %-58s [%s] THE GATE DID NOT CATCH THIS" % (name, half))
            print("        exit=%d  wanted signal: %r" % (rc, signal))
            for l in out.splitlines()[:8]:
                print("        | " + l)
            failed += 1

    if failed:
        print("\ncheck_maia_voice.mjs is NOT load-bearing for %d mutation(s)." % failed)

    # ------------------------------------------------- the invocation itself
    ok = selftest()
    print("\n%d of %d mutations turned the gate red, and the canary %s."
          % (passed, len(BREAKS), "holds" if ok else "DOES NOT HOLD"))
    return 1 if (failed or not ok) else 0


def selftest():
    """Break how the gate CALLS check-voice, not what it feeds it.

    THIS IS THE MUTATION THAT MATTERS MOST, because the defect it re-creates is
    the one this gate actually shipped with for a draft. check-voice.mjs
    resolves every argument by joining it onto the repo root. Hand it an
    absolute Windows path and the join produces a nonsense path, existsSync
    fails, the loop skips every file, and it prints an empty list and EXITS 0.
    Zero files scanned is byte-identical to zero violations found.

    The first draft of check_maia_voice.mjs passed an absolute path and printed
    ALL GREEN over three planted violations. The canary line is the fix, so the
    canary needs a mutation of its own: revert the invocation and the gate has
    to go red about itself rather than clean about Maia.
    """
    print("\nSELFTEST: the gate's own call into check-voice.mjs")
    src = io.open(GATE, encoding="utf-8").read()
    find, repl = '[VOICE, "--json", relArg]', '[VOICE, "--json", tmp]'
    if src.count(find) != 1:
        print("  SKIP  invocation anchor found %d times, expected 1" % src.count(find))
        return False
    mutant = os.path.join(HERE, ".check_maia_voice_mutant.mjs")
    io.open(mutant, "w", encoding="utf-8", newline="").write(src.replace(find, repl))
    try:
        p = subprocess.run([node(), mutant, ART], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        out = (p.stdout or "") + (p.stderr or "")
        if p.returncode != 0 and "canary" in out and "never read" in out:
            print("  RED   an absolute path reaches check-voice, and the canary catches it")
            return True
        print("  GREEN THE CANARY DID NOT CATCH THE THING IT EXISTS FOR")
        print("        exit=%d" % p.returncode)
        for l in out.splitlines()[:8]:
            print("        | " + l)
        return False
    finally:
        try:
            os.remove(mutant)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
