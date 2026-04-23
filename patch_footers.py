"""
patch_footers.py -- Updates footer in all matury-online landing pages.
Run from project root (where frontend/ lives) or from frontend/ directory.

    python patch_footers.py

Changes:
  - Subjects split into 2 columns of 5 (no "Wszystkie" link)
  - Current subject bolded on its own landing page
  - Grid cols adjusted (+1 for extra column)
"""

import os, sys, re

SUBJECTS = [
    ("polski", "Polski"),
    ("matematyka", "Matematyka"),
    ("angielski", "Angielski"),
    ("biologia", "Biologia"),
    ("chemia", "Chemia"),
    ("fizyka", "Fizyka"),
    ("historia", "Historia"),
    ("geografia", "Geografia"),
    ("wos", "WOS"),
    ("informatyka", "Informatyka"),
]


def subject_li(slug, name, is_current=False):
    if is_current:
        return f'          <li><span class="text-zinc-900 dark:text-zinc-100 font-medium">{name}</span></li>'
    return f'          <li><a href="/przedmiot/{slug}" class="hover:text-zinc-900 dark:hover:text-zinc-100 transition">{name}</a></li>'


def make_two_columns(current_slug=None):
    col1 = SUBJECTS[:5]
    col2 = SUBJECTS[5:]
    lines = []
    lines.append('      <div>')
    lines.append('        <h4 class="font-display font-semibold text-sm mb-4">Przedmioty</h4>')
    lines.append('        <ul class="space-y-2 text-sm text-zinc-500">')
    for s, n in col1:
        lines.append(subject_li(s, n, s == current_slug))
    lines.append('        </ul>')
    lines.append('      </div>')
    lines.append('      <div>')
    lines.append('        <h4 class="font-display font-semibold text-sm mb-4">&nbsp;</h4>')
    lines.append('        <ul class="space-y-2 text-sm text-zinc-500">')
    for s, n in col2:
        lines.append(subject_li(s, n, s == current_slug))
    lines.append('        </ul>')
    lines.append('      </div>')
    return '\n'.join(lines)


def patch(filepath, current_slug=None, old_grid_cols='4', new_grid_cols='5'):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Extract footer
    fm = re.search(r'(<footer[\s\S]*?</footer>)', content)
    if not fm:
        print(f"  FAIL No <footer> in {filepath}")
        return False

    footer = fm.group(1)
    new_footer = footer

    # 2. Change grid cols in footer
    new_footer = new_footer.replace(
        f'grid md:grid-cols-{old_grid_cols} gap-8',
        f'grid md:grid-cols-{new_grid_cols} gap-8'
    )

    # 3. Find and replace subjects block
    # Match: <div> containing <h4>Przedmioty</h4> and <ul>...</ul> ending with </div>
    # We look for the <div> that starts before the h4 Przedmioty
    subj_pattern = re.compile(
        r'(<div>\s*<h4[^>]*>Przedmioty</h4>\s*<ul[^>]*>)([\s\S]*?)(</ul>\s*</div>)',
        re.DOTALL
    )

    sm = subj_pattern.search(new_footer)
    if not sm:
        print(f"  WARN No Przedmioty block in footer of {filepath}")
        return False

    # Replace the entire match with two columns
    new_cols = make_two_columns(current_slug)
    new_footer = new_footer[:sm.start()] + new_cols + new_footer[sm.end():]

    # 4. Write back
    new_content = content[:fm.start()] + new_footer + content[fm.end():]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"  OK {os.path.basename(filepath)}")
    return True


def main():
    if os.path.exists(os.path.join('src', 'pages', 'index.astro')):
        base = '.'
    elif os.path.exists(os.path.join('frontend', 'src', 'pages', 'index.astro')):
        base = 'frontend'
    else:
        print("Run from project root or frontend/ directory")
        sys.exit(1)

    pages = os.path.join(base, 'src', 'pages')
    przedmiot = os.path.join(pages, 'przedmiot')

    print("\nPatching footers (2 cols x 5 subjects):\n")

    # Homepage: 5 → 6 cols
    hp = os.path.join(pages, 'index.astro')
    if os.path.exists(hp):
        patch(hp, current_slug=None, old_grid_cols='5', new_grid_cols='6')

    # Landings: 4 → 5 cols
    for slug, name in SUBJECTS:
        fp = os.path.join(przedmiot, f'{slug}.astro')
        if os.path.exists(fp):
            patch(fp, current_slug=slug, old_grid_cols='4', new_grid_cols='5')
        else:
            print(f"  -- {slug}.astro not found")

    print("\nDone! git diff to review.\n")


if __name__ == '__main__':
    main()