import Image, { eleventyImageTransformPlugin } from '@11ty/eleventy-img';

export default function(eleventyConfig) {
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    // output image formats
    formats: ['avif', 'jpeg'],

    // output image widths
    widths: [640, 1024, 1800],

    // optional, attributes assigned on <img> nodes override these values
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
      },
    },
  });

  const imgDir = (src, full) => imgFolder && !src.includes('://')
    ? join(full ? fullPath : imgFolder, src)
    : src;

  const imgSrc = async (src, config) => {
    const metadata = await Image(src, {
      formats: 'jpeg',
      widths: ['1200'],
      outputDir: './_site/img/',
      urlPath: '/img/',
      ...config
    });

    const img = metadata.jpeg.at(-1);
    return img.url;
  }

  eleventyConfig.addAsyncFilter('imgSrc', imgSrc);
};
