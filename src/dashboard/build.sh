#!/bin/sh
# Builds the manager dashboard (one index.html) from these parts. Run from the repo root:  sh src/dashboard/build.sh
# Output: dashboard-build/index.html  (upload it wherever the dashboard is hosted)
set -e
D="$(dirname "$0")"
mkdir -p dashboard-build
cat "$D/p2_core.js" "$D/p3_leads.js" "$D/p4_posts.js" "$D/p6_ads.js" "$D/p7_reports.js" "$D/p8_settings.js" "$D/p5_rest.js" > /tmp/bsg-dash.js
node --check /tmp/bsg-dash.js
{ cat "$D/p1_head.html"; printf '<script>\n'; cat /tmp/bsg-dash.js; printf '\n</script>\n</body>\n</html>\n'; } > dashboard-build/index.html
echo "built dashboard-build/index.html"
