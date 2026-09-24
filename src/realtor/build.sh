#!/bin/sh
# Builds web/index.html (the realtor app) from these parts. Run from the repo root:  sh src/realtor/build.sh
set -e
D="$(dirname "$0")"
cat "$D/r2_core.js" "$D/r3_leads.js" "$D/r4_posts.js" "$D/r45_push.js" "$D/r5_rest.js" > /tmp/bsgr-app.js
node --check /tmp/bsgr-app.js
{ cat "$D/r1_head.html"; printf '<script>\n'; cat /tmp/bsgr-app.js; printf '\n</script>\n</body>\n</html>\n'; } > web/index.html
echo "built web/index.html"
