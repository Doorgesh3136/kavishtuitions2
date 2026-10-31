// The plain collection pages: courses, tutors, testimonials, plans, resources, FAQs.

import { html } from "../../../assets/js/ui.js";
import { collectionView } from "./common.js";
import * as S from "../schemas.js";

export const courses = collectionView({
  id: "courses",
  title: "Courses",
  lead: "Each course is one teaching group. The order here is the order on the site; hidden courses stay here but disappear from the catalogue.",
  schema: S.courses,
  sitePath: "../#/courses",
});

export const tutors = collectionView({
  id: "tutors",
  title: "Tutors",
  lead: "Profiles on the Tutors page. A tutor without a photo is shown with a monogram of their initials, never a blank avatar.",
  schema: S.tutors,
  sitePath: "../#/tutors",
});

export const testimonials = collectionView({
  id: "testimonials",
  title: "Testimonials",
  lead: "Quotes from students and parents, shown on the homepage. Only publish what someone actually said, and ask them first.",
  schema: S.testimonials,
  sitePath: "../#/",
});

export const plans = collectionView({
  id: "plans",
  title: "Plans & fees",
  italic: "fees",
  lead: "The fee plans on the Plans page. Payment instructions — MCB Juice and bank transfer — live in Site & homepage → Contact & payment.",
  schema: S.plans,
  sitePath: "../#/plans",
});

export const resources = collectionView({
  id: "resources",
  title: "Resources",
  lead: "Past papers, worksheets, notes and videos. Give a link to share the file directly; leave it blank and the site offers a “Request” button that opens the enquiry form.",
  schema: S.resources,
  sitePath: "../#/resources",
});

export const faqs = collectionView({
  id: "faqs",
  title: "Questions parents ask",
  italic: "parents",
  lead: "The FAQ on the Plans page. Two or three plain sentences per answer read best.",
  schema: S.faqs,
  sitePath: "../#/plans",
  note: () => html`<p><strong>Tip.</strong> Put the question most parents ask on WhatsApp first — usually fees, the free trial lesson or what happens if a lesson is missed.</p>`,
});
