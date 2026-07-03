const dateDefault = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateFormat = (date) => {
  return dateDefault.format(date);
}

export default function (eleventyConfig) {
  eleventyConfig.addFilter('dateFormat', dateFormat);
};
