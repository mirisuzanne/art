import pluginWebc from "@11ty/eleventy-plugin-webc";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import yaml from "js-yaml";

import markdown from "./11ty/markdown.js";
import shipping from "./11ty/shipping.js";
import slides from "./11ty/slides.js";
import time from "./11ty/time.js";

export default async function(eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));

  eleventyConfig.addPlugin(markdown);
  eleventyConfig.addPlugin(shipping);
  eleventyConfig.addPlugin(slides);
  eleventyConfig.addPlugin(time);

  eleventyConfig.addPlugin(pluginWebc, {
    components: [
      'src/_webc/**/*.webc',
      'npm:@11ty/eleventy-img/*.webc',
      'npm:@11ty/is-land/*.webc',
      'npm:@terriblemia/ground-control/*.webc',
      'npm:@oddbird/slide-deck/**/*.webc',
      'npm:@oddbird/eleventy-plugin-slide-deck/components/**/*.webc',
    ],
  });

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

  eleventyConfig.addPassthroughCopy({
    './src/_css': 'css',
    './src/_fonts': 'fonts',
  });

  return {
    dir: {
      input: 'src',
      layouts: '_layouts',
    }
  }
}
