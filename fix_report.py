#!/usr/bin/env python3
import sys

with open('/home/subham/AIOSpark/AR-automation-revenue/docs/audits/AIOSPARK_FRESH_INDEPENDENT_FULL_PRODUCT_AUDIT_2026-11-10.md', 'r') as f:
    content = f.read()

# Fix 1: Remediation priorities P2 section - separate FRESH-D007 and FRESH-D009
old_p2 = """### P2 — Medium (Can Address Later)\n8. **FRESH-D007**: Fix import engine mixed-currency rejection and negative amount rejection (pre-existing; low priority for pilot; 4 test failures unrelated to financial fixes: 3.3, 3.4, 3.5, 4.7)\n\n### P3 — Low (Post-Pilot)\n9. Enhance accessibility (ARIA labels, focus visibility)"""

new_p2 = """### P2 — Medium (Can Address Later)\n8. **FRESH-D007**: Fix import engine mixed-currency rejection and negative amount rejection (pre-existing; low priority for pilot; **3 test failures**: 3.3, 3.4, 3.5)\n9. **FRESH-D009**: **Test 4.7 invoice status sequencing defect** (pre-existing; low priority; 1 test failure; not a credit allocation model defect)\n\n### P3 — Low (Post-Pilot)\n9. Enhance accessibility (ARIA labels, focus visibility)"""

if old_p2 in content:
    content = content.replace(old_p2, new_p2)
    print('Fix 1 applied: remediation priorities P2 section')
else:
    print('Fix 1: old_p2 not found')
    # Debug: show what's around FRESH-D007
    idx = content.find('FRESH-D007')
    if idx >= 0:
        print(f'Found FRESH-D007 at position {idx}')
        print(content[idx:idx+200])

# Fix 2: Risk register operational risks - add test 4.7 mention
old_risk_op = "Import limitations: 1,000-row limit; pre-existing engine issues (3.3-3.5)"
new_risk_op = "Import limitations: 1,000-row limit; pre-existing engine issues (3.3-3.5, 4.7)"

if old_risk_op in content:
    content = content.replace(old_risk_op, new_risk_op)
    print('Fix 2 applied: risk register operational risks')
else:
    print('Fix 2: old_risk_op not found')

# Fix 3: Check for "4 pre-existing import test failures" in readiness assessments
# and update to be more specific
old_readiness_import = "4 pre-existing import test failures"
# This appears in two places - Internal Development and Internal Testing readiness
# Let's check what the exact text is

# Fix 4: Verify the test breakdown summary is correct
# The test classification summary already says "40 PASSED + 4 FAILED = 44 total"
# and breaks down the 4 failures correctly

# Fix 5: Verify executive summary test breakdown
# Already correct: "40 PASSED + 4 FAILED across 7 test groups"

with open('/home/subham/AIOSpark/AR-automation-revenue/docs/audits/AIOSPARK_FRESH_INDEPENDENT_FULL_PRODUCT_AUDIT_2026-11-10.md', 'w') as f:
    f.write(content)

print('Script complete')
print(f'Content length: {len(content)}')
print(f'Fix 1 (remediation priorities): {"applied" if old_p2 in content or new_p2 in content else "not applied"}')