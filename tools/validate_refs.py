# -*- coding: utf-8 -*-
"""Validate every scripture reference in the devotion JSONs against the actual
Bible text (chapter AND verse must exist). Emits a report for ministry review."""
import json, re, glob, io, sys, unicodedata
import xml.etree.ElementTree as ET
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CANON = ["ዘፍጥረት","ዘጸአት","ዘሌዋውያን","ዘኍልቁ","ዘዳግም","ኢያሱ","መሳፍንት","ሩት","1ኛ ሳሙኤል","2ኛ ሳሙኤል",
"1ኛ ነገሥት","2ኛ ነገሥት","1 ዜና","2 ዜና","ዕዝራ","ነሀምያ","አስቴር","ኢዮብ","መዝሙር","ምሳሌ","መክብብ","መኃልየ",
"ኢሳይያስ","ኤርምያስ","ሰቆቃወ ኤርምያስ","ሕዝቅኤል","ዳንኤል","ሆሴዕ","ኢዮኤል","አሞጽ","አብድዩ","ዮናስ","ሚክያስ","ናሆም",
"ዕንባቆም","ሶፎንያስ","ሐጌ","ዘካርያስ","ሚልክያስ","ማቴዎስ","ማርቆስ","ሉቃስ","ዮሐንስ","ሐዋርያት","ሮሜ","1ኛ ቆሮንቶስ",
"2ኛ ቆሮንቶስ","ገላትያ","ኤፌሶን","ፊልጵስዩስ","ቆላስይስ","1ኛ ተሰሎንቄ","2ኛ ተሰሎንቄ","1ኛ ጢሞቴዎስ","2ኛ ጢሞቴዎስ",
"ቲቶ","ፊልሞና","ዕብራውያን","ያዕቆብ","1ኛ ጴጥሮስ","2ኛ ጴጥሮስ","1ኛ ዮሐንስ","2ኛ ዮሐንስ","3ኛ ዮሐንስ","ይሁዳ","ራእይ"]
EN = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel",
"2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms",
"Proverbs","Ecclesiastes","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea",
"Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
"Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians",
"Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon",
"Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
ABBR = {"ዘፍ":0,"ዘጸ":1,"ዘሌ":2,"ዘኍ":3,"ዘዳ":4,"ኢያ":5,"መሳ":6,"ሩት":7,"1ኛ ሳሙ":8,"1 ሳሙ":8,"2ኛ ሳሙ":9,
"1ኛ ነገ":10,"2ኛ ነገ":11,"1 ዜና":12,"2 ዜና":13,"ዕዝ":14,"ነሀ":15,"አስ":16,"ኢዮብ":17,"መዝ":18,"ምሳ":19,
"መክ":20,"መኃ":21,"ኢሳ":22,"ኤር":23,"ሰቆ":24,"ሕዝ":25,"ዳን":26,"ሆሴ":27,"ኢዮኤ":28,"አሞጽ":29,"አብ":30,
"ዮናስ":31,"ሚክ":32,"ናሆም":33,"ዕንባ":34,"ሶፎ":35,"ሐጌ":36,"ዘካ":37,"ሚል":38,"ማቴ":39,"ማር":40,"ሉቃ":41,
"ዮሐ":42,"ሐዋ":43,"ሮሜ":44,"1ኛ ቆሮ":45,"2ኛ ቆሮ":46,"ገላ":47,"ኤፌ":48,"ፊልጵ":49,"ቆላ":50,"1ኛ ተሰ":51,
"2ኛ ተሰ":52,"1ኛ ጢሞ":53,"2ኛ ጢሞ":54,"ቲቶ":55,"ፊልሞ":56,"ዕብ":57,"ያዕ":58,"1ኛ ጴጥ":59,"2ኛ ጴጥ":60,
"1ኛ ዮሐ":61,"2ኛ ዮሐ":62,"3ኛ ዮሐ":63,"ይሁዳ":64,"ራእ":65}

# --- verse counts straight from the bundled text ---
print('indexing bible…', file=sys.stderr)
VC = {}   # (book0, chapter) -> verse count
root = ET.parse('bibles/AmharicNASVBible.xml').getroot()
bi = 0
for t in root.findall('testament'):
    for b in t.findall('book'):
        for c in b.findall('chapter'):
            VC[(bi, int(c.get('number')))] = len(c.findall('verse'))
        bi += 1

# which study book each file is about, for resolving bare "3:1-2" refs
FILE_BOOK = {'book_01_ruth_localized.json':7,'book_02_psalms_localized.json':18,
             'book_03_1st_timothy_localized.json':53}

SEPS = re.compile(r'[፤፣;,]')
SPAN = re.compile(r'^(?P<book>.*?)\s*(?P<ch>\d+)\s*[:]\s*(?P<v>\d+)\s*-\s*(?P<ch2>\d+)\s*[:]\s*(?P<v2>\d+)$')
REF  = re.compile(r'^(?P<book>.*?)\s*(?P<ch>\d+)\s*[:]\s*(?P<v>\d+)(?:\s*-\s*(?P<v2>\d+))?$')
BARE = re.compile(r'^(?P<v>\d+)(?:\s*-\s*(?P<v2>\d+))?$')
CHON = re.compile(r'^(?P<book>.*?)\s*(?P<ch>\d+)$')

def norm(s): return unicodedata.normalize('NFC', s).replace('፡',':').strip()
def lookup(tok):
    tok = tok.strip().rstrip('.').strip()
    if not tok: return None
    for k in sorted(ABBR, key=len, reverse=True):
        if tok == k or tok.startswith(k): return ABBR[k]
    for i,c in enumerate(CANON):
        if tok.startswith(c): return i
    return None

issues, ok = [], 0
for path in sorted(glob.glob('book_*.json')):
    home = FILE_BOOK.get(path)
    data = json.load(open(path, encoding='utf-8'))
    for bk in data['books']:
        for d in bk['daily_devotions']:
            day = d['day']
            for field in ('verses','key_verses','cross_references'):
                raw = d.get(field)
                if not raw: continue
                for part in SEPS.split(raw):
                    part = norm(part).strip('() ').strip()
                    if not part: continue
                    if part.count(':') > 1 and not SPAN.match(part):
                        issues.append((path,day,field,part,
                            'AMBIGUOUS — looks like two references run together; needs a separator')); continue
                    m = SPAN.match(part) or REF.match(part)
                    bare = BARE.match(part)
                    if bare and home is not None:
                        idx, ch = home, None
                        issues.append((path,day,field,part,
                            'INCOMPLETE — verse range with no chapter; chapter must be stated explicitly')); continue
                    if not m:
                        m2 = CHON.match(part)
                        if m2 and lookup(m2.group('book')) is not None:
                            ok += 1; continue
                        issues.append((path,day,field,part,'UNPARSEABLE — not a recognisable reference')); continue
                    bname = m.group('book').strip()
                    idx = lookup(bname) if bname else home
                    if idx is None:
                        issues.append((path,day,field,part,f'UNKNOWN BOOK "{bname}"')); continue
                    bad = False
                    for chg,vg in (('ch','v'),('ch2','v2')):
                        if chg not in m.groupdict() or m.groupdict().get(chg) is None: continue
                        ch = int(m.group(chg)); v = m.groupdict().get(vg)
                        n = VC.get((idx,ch))
                        if n is None:
                            issues.append((path,day,field,part,
                                f'CHAPTER DOES NOT EXIST — {CANON[idx]} ({EN[idx]}) has no chapter {ch}')); bad=True; break
                        if v and int(v) > n:
                            issues.append((path,day,field,part,
                                f'VERSE DOES NOT EXIST — {CANON[idx]} ({EN[idx]}) {ch} has {n} verses, reference says {v}')); bad=True; break
                    if not bad: ok += 1

print(f'\nreferences validated against the bundled text : {ok}')
print(f'references needing ministry review           : {len(issues)}')
cur=None
for path,day,field,part,why in issues:
    if path!=cur: print(f'\n## {path}'); cur=path
    print(f'  day {day:>2}  [{field}]  "{part}"\n           → {why}')
