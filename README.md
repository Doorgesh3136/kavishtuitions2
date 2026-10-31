# Kavish Tuitions — website + admin panel

A tuition website for Grade 7–13 in Mauritius (NCE, SC / O Level, HSC / A Level) with:

- **The public site**: a 3D scene of plaster maths models that rearrange on every page, a loading screen,
  page-turn transitions, smooth scrolling and red-pen animations that draw themselves in. The pages are:
  - Home
  - Courses, with filters and a page for each course
  - Tutors
  - Resources (past papers and notes)
  - Plans & timetable
  - A placement quiz
  - An enrolment form
- **An admin panel at `/admin`** where the teacher edits everything on the site, reads enquiries and publishes
  changes. No server or database is needed.

Everything is plain HTML, CSS and JavaScript. There is no build step and nothing is loaded from other websites,
so it works as soon as it's on GitHub Pages.

> **This is test content.** The courses, tutors, testimonials, prices, phone numbers and address are made up.
> The admin's *Overview* page has a launch checklist of everything to replace before showing it to anyone.

---

## 1. Put it online (GitHub Pages, about 2 minutes)

1. On GitHub open the repository, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the branch that holds this code (for example `main`) and the **/ (root)** folder, then **Save**.
4. Wait a minute or two. The site appears at
   `https://<your-username>.github.io/kavishtuitions2/`
   and the admin at
   `https://<your-username>.github.io/kavishtuitions2/admin/`

## 2. Log in to the admin

- Go to `…/kavishtuitions2/admin/`
- Default password: **`admin123`**. Change it under **Security** and then publish (see below).

The password only keeps the editing screens tidy. It is **not** real security, because anyone can read a
static site's files. What actually protects the live site is the GitHub token in step 3: nobody can change the
public website without it.

## 3. Publishing changes from the admin

Edits are saved in your browser straight away as a **draft**. In that same browser the public site shows the
draft, with a small "Previewing unpublished edits" banner, so you can check your work. To make the changes
live for everyone:

1. Create a GitHub token (once per device):
   - Open https://github.com/settings/personal-access-tokens/new (a *fine-grained* token).
   - **Repository access**: *Only select repositories* → `kavishtuitions2`.
   - **Repository permissions → Contents**: *Read and write*. Nothing else is needed.
   - Generate it and copy it.
2. In the admin go to **Publish**. Paste the token, check the owner, repository and **branch** (the branch
   you chose in GitHub Pages), then click **Test connection**.
3. Click **Publish now**. The admin saves `data/content.json` to GitHub, and GitHub Pages updates the live
   site in about 1–2 minutes.

The token is stored only in that browser and is sent only to `api.github.com`. Use **Forget token** on shared
computers.

The Publish page also lets you **download** the content as a backup, **import** a backup, **pull** the latest
version from GitHub, or **discard** local changes.

## 4. Enquiries

The enrolment form lives on a static site with no server behind it, so each enquiry is handled in three ways:

- It's **saved in the visitor's browser**. On the teacher's own device it appears in **Admin → Enquiries**,
  which is handy for testing and walk-in sign-ups.
- The visitor is offered **"Send on WhatsApp"** (or email), with the message pre-filled, to the WhatsApp
  number set in **Site & homepage**. This is how real enquiries reach the teacher.
- Optionally, put a free form-forwarding endpoint (for example a [Formspree](https://formspree.io) form URL)
  in **Site & homepage → Form endpoint**. Every enquiry from every device is then also emailed to you.

## 5. Try it on your own computer

ES modules don't run from `file://`, so start a tiny local server in the project folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ and http://localhost:8000/admin/
```

## How it's built

```
index.html            public site shell (loader, header, footer, transitions)
404.html              sends old or deep links like /kavishtuitions2/courses to the right page
admin/                admin panel (index.html, admin.css, admin.js, js/)
data/content.json     ALL site content, edited by the admin and published to GitHub
assets/js/app.js      boot, loading screen, hash router (#/courses …), page transitions, menus
assets/js/scene.js    the Three.js 3D scene (persistent canvas, one layout per page)
assets/js/motion.js   scroll and entrance animations, driven by data-* attributes
assets/js/views/      one module per page (home, courses, tutors, resources, plans, quiz, enrol)
assets/js/store.js    content loading, drafts, enquiries, GitHub publishing
assets/js/ui.js       safe HTML templating, icons, red-pen marks
assets/css/           tokens, fonts, shared components, one stylesheet per page
assets/vendor/        three.js r170, GSAP 3.13, Lenis 1.1 (kept locally)
assets/fonts/         Instrument Serif, Geist, Geist Mono (kept locally)
```

- Pages use hash links (`#/courses`, `#/courses/sc-mathematics`, `#/enrol?course=…`), so GitHub Pages never
  shows a 404 for them.
- People who prefer less motion (the *reduce motion* setting) get simple fades, normal scrolling and a still
  3D scene. Browsers without WebGL show a line drawing instead of the 3D scene.
- For debugging, `window.KT` in the browser console exposes the current content, the router and the scene.

## Credits & licences

- [three.js](https://threejs.org) — MIT (`assets/vendor/three/LICENSE`)
- [GSAP](https://gsap.com) incl. ScrollTrigger, SplitText, Flip, CustomEase — free under the
  [GSAP Standard License](https://gsap.com/standard-license)
- [Lenis](https://github.com/darkroomengineering/lenis) — MIT (`assets/vendor/lenis/LICENSE`)
- Fonts: Instrument Serif, Geist and Geist Mono — SIL Open Font License (`assets/fonts/`)
