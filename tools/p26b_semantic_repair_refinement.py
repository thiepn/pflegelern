#!/usr/bin/env python3
"""P26B precision refinement for numeric range rendering.

P26A's numeric parser treats an en-dash between two values as a unary minus in
one edge case. Expressing the same source-backed adult pulse range as
"60 bis 100/min" removes that parser ambiguity without changing its meaning.
"""

import p26b_semantic_repair as repair

repair.EXPECTED_CORRECTED["q-16-1-01"]["options"][0]["text"] = "60 bis 100/min"
repair.EXPECTED_CORRECTED["q-16-1-02"]["options"][1]["text"] = "60 bis 100/min"

if __name__ == "__main__":
    repair.main()
