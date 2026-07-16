import pluginSlideDeck from '@oddbird/eleventy-plugin-slide-deck';

const hasOtherLayout = (slide, layouts) => {
  if (!slide.layout) return false;
  if (layouts.includes(slide.layout)) return false;
  return true;
}

const youTubeSlide = (slide) => {
  if (hasOtherLayout(slide, ['youtube', 'embed'])) return slide;

  const bg = `background-image: url('https://v1.opengraph.11ty.dev/https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3D${slide.youtube}/auto/jpeg/');`;
  slide.layout = 'embed';
  slide.embed = `
    <lite-youtube
      videoid="${slide.youtube}"
      style="${bg}"
      @text="${slide.title}"
    ></lite-youtube>
  `;
  return slide;
}

const buildFunction = (slide) => {
  if (slide.youtube) return youTubeSlide(slide);
  return slide;
};

export default async function(eleventyConfig) {
  eleventyConfig.addPlugin(pluginSlideDeck, {
    imgDir: '/_img/',
    buildFunction,
  });
}
