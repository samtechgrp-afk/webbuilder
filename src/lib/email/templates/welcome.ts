import { button, esc, h1, layout, p, type RenderedEmail } from "../layout";

export interface SiteWelcomeData {
  recipientName: string | null;
  siteName: string;
  templateName: string;
  accent: string | null;
  editorUrl: string;
  siteUrl: string;
  designUrl: string;
}

/** Sent to the creator when a site is provisioned from a starter template. */
export function siteWelcomeEmail(d: SiteWelcomeData): RenderedEmail {
  const brand = { name: d.siteName, accent: d.accent };
  const hi = d.recipientName ? `Welcome, ${d.recipientName.split(" ")[0]}!` : "Welcome!";
  const steps: [string, string][] = [
    ["Make the home page yours", "Swap in your words and photos on the canvas."],
    ["Check the design system", "Colours, fonts and spacing apply to every page at once."],
    ["Publish", "The site is a draft until you publish; only you can see it now."],
  ];
  const list = steps
    .map(([title, text], i) => `<tr><td style="padding:0 12px 14px 0;vertical-align:top;font-weight:700;color:#18181b">${i + 1}.</td><td style="padding:0 0 14px"><strong style="color:#18181b">${esc(title)}</strong><br><span style="color:#52525b">${esc(text)}</span></td></tr>`)
    .join("");
  const body = [
    h1(hi),
    p(`<strong>${esc(d.siteName)}</strong> is ready. We set it up from the <strong>${esc(d.templateName)}</strong> template with its pages, design system and sample content, so everything is editable from the start.`),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;font-size:14px">${list}</table>`,
    button("Open the editor", d.editorUrl, brand),
    p(`Your draft lives at <a href="${esc(d.siteUrl)}" style="color:#18181b">${esc(d.siteUrl.replace(/^https?:\/\//, ""))}</a>. Edit the design system any time at <a href="${esc(d.designUrl)}" style="color:#18181b">Design system</a>.`),
  ].join("");
  return {
    subject: `${d.siteName} is ready to edit`,
    html: layout({ brand, preheader: `Your new site from the ${d.templateName} template is ready.`, body, footer: "You're receiving this because you created this site." }),
    text: [hi, "", `${d.siteName} is ready. It was set up from the ${d.templateName} template.`, "", ...steps.map(([t, x], i) => `${i + 1}. ${t}: ${x}`), "", `Open the editor: ${d.editorUrl}`, `Your draft: ${d.siteUrl}`, `Design system: ${d.designUrl}`].join("\n"),
  };
}
