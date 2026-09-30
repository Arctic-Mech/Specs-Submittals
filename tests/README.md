# Tests

    node tests/dingus.test.js

`dingus.test.js` pulls the classic `<script>` out of `index.html`, runs it in a Node `vm` behind
enough of a browser to let the logic work, and then calls the app's own functions and checks what
they do. Nothing is re-implemented, so a passing check is the shipped code passing.

It lives in the repo on purpose. An earlier copy lived in `/tmp`, the container was reclaimed
overnight, and a thousand checks went with it.

## Optional engines

The spreadsheet and PDF checks need SheetJS and jsPDF. They are not vendored — when they are
absent those checks print `skipped:` instead of failing, so the harness runs on a bare checkout.
To include them:

    mkdir -p /tmp/deps && cd /tmp/deps && npm i xlsx@0.18.5 jspdf@2.5.1 jspdf-autotable

## Writing a check

The test body at the bottom of the file is injected into the vm **as a template literal**, so it
must not contain a backtick, a `${`, or a backslash. Use `String.fromCharCode` for anything
awkward, and `indexOf` rather than a regex literal with escapes.

Each check is `ck('what it should do, in plain words', <condition>)`. The name is read by someone
looking at a failure, so write it as the promise being broken, not as the function being tested.
