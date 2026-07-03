import markdownIt from 'markdown-it';

const mdIt = markdownIt({
  html: true,
  breaks: false,
  typographer: true,
});

const block = (content) => (content ? mdIt.render(content.trim()) : '');
const inline = (content) => (content ? mdIt.renderInline(content.trim()) : '');

export default function (eleventyConfig) {
  eleventyConfig.addFilter('mdBlock', block);
  eleventyConfig.addFilter('mdInline', inline);

  eleventyConfig.setLibrary('md', mdIt);
  eleventyConfig.addPreprocessor(
    "webMD",
    "md,webc",
    (data, content) => (
      data.templateEngineOverride === 'webc' || data.parse === 'md'
      ? block(content)
      : content
    )
  );
};
