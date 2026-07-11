import json, subprocess, sys, hashlib, os

def test_build_produces_valid_level_files():
    subprocess.run([sys.executable, "build_web_data.py"], check=True)
    seen = set()
    for lv in ["n5", "n4", "n3", "n2", "n1"]:
        path = f"web/data/{lv}.json"
        assert os.path.exists(path), f"missing {path}"
        arr = json.load(open(path, encoding="utf-8"))
        assert isinstance(arr, list) and arr, f"{path} empty"
        for e in arr:
            for k in ("id","level","category","word","kana","romaji","pos","zh","ex","ex_zh"):
                assert e.get(k) not in (None, ""), f"{lv} {e.get('word')} missing {k}"
            assert e["level"] == lv.upper()
            want = hashlib.sha1(f"{e['word']}|{e['kana']}".encode()).hexdigest()[:12]
            assert e["id"] == want
            assert e["id"] not in seen, f"dup id {e['id']}"
            seen.add(e["id"])

if __name__ == "__main__":
    test_build_produces_valid_level_files()
    print("ok")
