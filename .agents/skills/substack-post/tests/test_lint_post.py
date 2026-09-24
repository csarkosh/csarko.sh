"""Tests for lint_post.py. Run: python3 -m unittest discover -s .agents/skills/substack-post/tests"""

import importlib.util
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("lint_post", Path(__file__).resolve().parents[1] / "scripts/lint_post.py")
lint_post = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lint_post)

PUBLISHED = {"grass-and-trail-realism", "no-visible-pop-in", "stylized-shader-looks"}
UTM = "utm_source=substack&utm_medium=email&utm_campaign=why-my-grass-looked-fake"


def url(slug, query=UTM):
    return f"https://csarko.sh/research/{slug}" + (f"?{query}" if query else "")


IMAGE = "![A foggy stretch of trail in Day Hike](dayhike.jpg)"
FILLER = "I spent a week on this bug before I found the cause in the shader. " * 6


def post(title="I spent a month making grass look real in a browser game",
         subtitle="What finally fixed it was the trail",
         paras=None, button=None, first=None, image=True):
    first = first if first is not None else (
        f"The full write-up is [on my site]({url('grass-and-trail-realism')}), with the numbers.")
    paras = paras if paras is not None else [FILLER.strip()] * 4 + ["Have you ever fought grass like this?"]
    button = button if button is not None else f"[Read the full write-up]({url('grass-and-trail-realism')})"
    image = [IMAGE] if image else []
    return "\n\n".join([f"# {title}", f"## {subtitle}", first, *image, *paras, button]) + "\n"


def run(text, notes=None, slugs=("grass-and-trail-realism",), protect=(), author=False):
    return lint_post.lint(text, notes=notes, slugs=list(slugs), published=PUBLISHED, protect=list(protect),
                          author=author)


def errors(findings):
    return [f for f in findings if f.level == "error"]


def warnings(findings):
    return [f for f in findings if f.level == "warning"]


def has(findings, needle):
    return any(needle in f.message for f in findings)


class CleanPost(unittest.TestCase):
    def test_clean_post_has_no_findings(self):
        self.assertEqual(run(post(), notes="New post today about grass."), [])


class Parsing(unittest.TestCase):
    def test_missing_title_or_subtitle(self):
        self.assertTrue(has(errors(run("Just a body.\n")), "title"))
        self.assertTrue(has(errors(run("# A title only\n\nBody.\n")), "subtitle"))

    def test_line_numbers(self):
        text = post(paras=[FILLER.strip()] * 4 + ["It was a pivotal moment. Have you?"])
        (f,) = [f for f in run(text) if "pivotal" in f.message]
        self.assertEqual(text.splitlines()[f.line - 1].count("pivotal"), 1)


class SiteRules(unittest.TestCase):
    def test_em_and_en_dash(self):
        self.assertTrue(has(errors(run(post(subtitle="What fixed it — the trail at last"))), "dash"))
        self.assertTrue(has(errors(run(post(), notes="Grass – again.")), "dash"))

    def test_email_and_phone(self):
        self.assertTrue(has(errors(run(post(paras=["Write to me at someone@example.com please."]))), "email"))
        self.assertTrue(has(errors(run(post(paras=["Call (212) 555-0100 any time."]))), "phone"))

    def test_youtube_handle_is_not_an_email(self):
        self.assertFalse(has(run(post(paras=[FILLER.strip()] * 4 + ["I post films on YouTube as @csarkosh. Seen one?"])), "email"))


class Links(unittest.TestCase):
    def test_every_slug_linked(self):
        self.assertTrue(has(errors(run(post(), slugs=["grass-and-trail-realism", "no-visible-pop-in"])), "no-visible-pop-in"))

    def test_unknown_slug(self):
        text = post(first=f"The write-up is [here]({url('not-a-real-doc')}).")
        self.assertTrue(has(errors(run(text)), "not-a-real-doc"))

    def test_link_in_first_two_paragraphs(self):
        text = post(first="No link up here.", paras=["Nor here.", FILLER.strip(), FILLER.strip(), FILLER.strip(),
                                                     "Have you?"])
        self.assertTrue(has(errors(run(text)), "paragraph 1 or 2"))
        text = post(first="No link up here.", paras=[f"But [here]({url('grass-and-trail-realism')}).", FILLER.strip(),
                                                     FILLER.strip(), FILLER.strip(), "Have you?"])
        self.assertFalse(has(errors(run(text)), "paragraph 1 or 2"))

    def test_utm_missing(self):
        text = post(button=f"[Read it]({url('grass-and-trail-realism', query=None)})")
        self.assertTrue(has(errors(run(text)), "utm"))

    def test_utm_campaign_mismatch(self):
        other = "utm_source=substack&utm_medium=email&utm_campaign=something-else"
        text = post(button=f"[Read it]({url('grass-and-trail-realism', query=other)})")
        self.assertTrue(has(errors(run(text)), "utm_campaign"))

    def test_research_index_link_is_fine(self):
        text = post(button=f"[All my research](https://csarko.sh/research?{UTM})")
        self.assertEqual(errors(run(text)), [])

    def test_url_in_notes(self):
        self.assertTrue(has(errors(run(post(), notes="Read it at https://csarko.sh/research")), "URL"))
        self.assertTrue(has(errors(run(post(), notes="It's up on csarko.sh now.")), "URL"))


class AiTells(unittest.TestCase):
    def tell(self, sentence):
        return errors(run(post(paras=[FILLER.strip()] * 4 + [sentence + " Have you?"])))

    def test_vocabulary(self):
        for word in ["delve", "delving", "tapestry", "a testament", "crucial", "leverages", "showcasing", "seamless"]:
            with self.subTest(word=word):
                self.assertTrue(self.tell(f"This one is {word} to me."), word)

    def test_vocabulary_is_whole_words(self):
        self.assertTrue(self.tell("They are fostering it."))
        self.assertEqual(self.tell("The Forster novel."), [])

    def test_negative_parallelism(self):
        self.assertTrue(self.tell("It is not just a shader bug, but a design problem."))
        self.assertTrue(self.tell("It's not the grass, it's the light."))
        self.assertTrue(self.tell("This isn't a fix, it's a workaround."))

    def test_copula_avoidance(self):
        self.assertTrue(self.tell("The trail serves as a guide."))

    def test_staged_openers_and_closers(self):
        self.assertTrue(self.tell("Here's the thing about grass."))
        self.assertTrue(self.tell("Let's dive in."))
        self.assertTrue(self.tell("In short, it worked."))
        self.assertTrue(self.tell("Ultimately, it worked."))

    def test_bold_limit(self):
        self.assertEqual(self.tell("**One** and **two** are fine."), [])
        self.assertTrue(self.tell("**One**, **two** and **three** is too many."))

    def test_header_in_body(self):
        text = post(paras=["### A section", FILLER.strip(), FILLER.strip(), FILLER.strip(), "Have you?"])
        self.assertTrue(has(errors(run(text)), "header"))

    def test_protect_list_exempts_tells(self):
        text = post(paras=[FILLER.strip()] * 4 + ["The code is robust. Have you?"])
        self.assertTrue(errors(run(text)))
        self.assertEqual(errors(run(text, protect=["robust"])), [])

    def test_protect_list_never_exempts_site_rules(self):
        text = post(subtitle="What fixed it — the trail at last")
        self.assertTrue(errors(run(text, protect=["—"])))


class AuthorMode(unittest.TestCase):
    """His own writing: the AI-tell lists only warn, the site and link rules still fail."""

    def test_tells_become_warnings(self):
        text = post(paras=[FILLER.strip()] * 4 + ["The code is robust. It's not the grass, it's the light. Have you?"])
        self.assertTrue(errors(run(text)))
        found = run(text, author=True)
        self.assertEqual(errors(found), [])
        self.assertTrue(has(warnings(found), "robust"))
        self.assertTrue(has(warnings(found), "negative parallelism"))

    def test_site_and_link_rules_still_fail(self):
        text = post(subtitle="What fixed it \u2014 the trail at last",
                    button=f"[Read it]({url('grass-and-trail-realism', query=None)})")
        found = errors(run(text, author=True))
        self.assertTrue(has(found, "dash"))
        self.assertTrue(has(found, "utm"))

    def test_notes_urls_still_fail(self):
        self.assertTrue(has(errors(run(post(), notes="It's on csarko.sh now.", author=True)), "URL"))


class Warnings(unittest.TestCase):
    def test_title_length_and_question(self):
        self.assertTrue(has(warnings(run(post(title="Grass"))), "title"))
        self.assertTrue(has(warnings(run(post(title="Why did my grass look so fake in a browser game for months?"))),
                            "question"))

    def test_subtitle_length_and_overlap(self):
        self.assertTrue(has(warnings(run(post(subtitle="The trail"))), "subtitle"))
        self.assertTrue(has(warnings(run(post(subtitle="Making grass look real in a browser game"))), "repeats"))

    def test_body_length(self):
        self.assertTrue(has(warnings(run(post(paras=["Short. Have you?"]))), "words"))
        self.assertTrue(has(warnings(run(post(paras=[FILLER.strip()] * 9 + ["Have you?"]))), "words"))

    def test_image(self):
        self.assertTrue(has(warnings(run(post(image=False))), "image"))
        self.assertFalse(has(warnings(run(post())), "image"))

    def test_caption_is_not_body_words(self):
        # 300 body words exactly, then a long caption: still 300, not more
        words = ("word " * 300).strip()
        text = post(first=f"[Link]({url('grass-and-trail-realism')}) {words}", paras=["Have you?"])
        text = text.replace(IMAGE, "![" + "caption " * 400 + "](x.jpg)")
        self.assertFalse(has(warnings(run(text)), "words"))

    def test_closing_question(self):
        self.assertTrue(has(warnings(run(post(paras=[FILLER.strip()] * 4 + ["That is all."]))), "question"))

    def test_rule_of_three(self):
        lists = " ".join(["I tried wind, light and fog."] * 3)
        self.assertTrue(has(warnings(run(post(paras=[FILLER.strip()] * 4 + [lists + " Have you?"]))), "lists"))
        two = " ".join(["I tried wind, light and fog."] * 2)
        self.assertFalse(has(warnings(run(post(paras=[FILLER.strip()] * 4 + [two + " Have you?"]))), "lists"))


class Voice(unittest.TestCase):
    def test_protect_section(self):
        voice = "# Voice\n## Rules\n- short\n## Protect\n- robust\n-  Not just \n\n## Examples\n- nope\n"
        self.assertEqual(lint_post.protect_list(voice), ["robust", "not just"])

    def test_no_protect_section(self):
        self.assertEqual(lint_post.protect_list("# Voice\n## Rules\n"), [])


if __name__ == "__main__":
    unittest.main()
