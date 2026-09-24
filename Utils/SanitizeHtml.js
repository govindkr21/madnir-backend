const sanitizeHtml = require("sanitize-html");

const sanitizeRichText = (value) =>
  sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "sub", "sup",
    ],
    allowedAttributes: {
      p: ["style"],
      div: ["style"],
      span: ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
      },
    },
    disallowedTagsMode: "discard",
    allowProtocolRelative: false,
  });

module.exports = { sanitizeRichText };