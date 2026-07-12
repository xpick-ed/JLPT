import unittest
from build_grammar_cloze import validate, build_level

GOOD = {
    "category": "判断・説明・当然", "pattern": "〜わけだ",
    "meaning_zh": "難怪…", "note": "n", "ex_zh": "難怪日語這麼好。",
    "before": "日本語（にほんご）が上手（じょうず）な", "answer": "わけだ", "after": "。",
    "distractors": ["はずがない", "ことだ", "ものだ"],
}

class TestValidate(unittest.TestCase):
    def test_good_item_has_no_errors(self):
        self.assertEqual(validate(GOOD), [])

    def test_answer_in_distractors_rejected(self):
        bad = {**GOOD, "distractors": ["わけだ", "ことだ", "ものだ"]}
        self.assertTrue(any("distractor" in e for e in validate(bad)))

    def test_wrong_distractor_count_rejected(self):
        bad = {**GOOD, "distractors": ["ことだ", "ものだ"]}
        self.assertTrue(validate(bad))

    def test_empty_before_or_answer_rejected(self):
        self.assertTrue(validate({**GOOD, "before": ""}))
        self.assertTrue(validate({**GOOD, "answer": ""}))

    def test_unbalanced_furigana_parens_rejected(self):
        bad = {**GOOD, "before": "日本語（にほんごが上手な"}
        self.assertTrue(any("furigana" in e for e in validate(bad)))

class TestBuildLevel(unittest.TestCase):
    def test_emits_id_and_uppercase_level(self):
        seen = set()
        out = build_level([dict(GOOD)], "n3", seen)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["level"], "N3")
        self.assertEqual(len(out[0]["id"]), 12)

    def test_dedups_same_pattern_across_calls(self):
        seen = set()
        build_level([dict(GOOD)], "n3", seen)
        out2 = build_level([dict(GOOD)], "n2", seen)  # pattern|n2 is new key → still emitted
        self.assertEqual(len(out2), 1)
        # same lv twice → deduped
        seen2 = set()
        first = build_level([dict(GOOD)], "n3", seen2)
        second = build_level([dict(GOOD)], "n3", seen2)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)

if __name__ == "__main__":
    unittest.main()
