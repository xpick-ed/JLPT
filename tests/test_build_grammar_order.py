import unittest
from build_grammar_order import validate, build_level

GOOD = {
    "category": "条件・逆接・仮定", "pattern": "〜ば〜ほど",
    "connection": "…", "note": "n", "ex_zh": "越讀越懂。",
    "before": "この本（ほん）は", "after": "分（わ）かってくる。",
    "frags": ["読（よ）めば", "読（よ）むほど", "意味（いみ）が", "深（ふか）く"],
}

class TestValidate(unittest.TestCase):
    def test_good_item_has_no_errors(self):
        self.assertEqual(validate(GOOD), [])
    def test_wrong_frag_count_rejected(self):
        self.assertTrue(validate({**GOOD, "frags": ["a", "b", "c"]}))
    def test_empty_fragment_rejected(self):
        self.assertTrue(validate({**GOOD, "frags": ["a", "", "c", "d"]}))
    def test_duplicate_fragment_rejected(self):
        self.assertTrue(any("distinct" in e for e in validate({**GOOD, "frags": ["a", "a", "c", "d"]})))
    def test_unbalanced_furigana_rejected(self):
        self.assertTrue(any("furigana" in e for e in validate({**GOOD, "before": "この本（ほん"})))

class TestBuildLevel(unittest.TestCase):
    def test_emits_id_and_uppercase_level(self):
        out = build_level([dict(GOOD)], "n3", set())
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["level"], "N3")
        self.assertEqual(len(out[0]["id"]), 12)
    def test_dedups_same_sentence(self):
        seen = set()
        self.assertEqual(len(build_level([dict(GOOD)], "n3", seen)), 1)
        self.assertEqual(len(build_level([dict(GOOD)], "n3", seen)), 0)

if __name__ == "__main__":
    unittest.main()
