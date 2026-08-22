import 'dotenv/config';

import pluginWebc from "@11ty/eleventy-plugin-webc";
import yaml from "js-yaml";

import collect from "./11ty/collect.js";
import images from "./11ty/images.js";
import markdown from "./11ty/markdown.js";
import shipping from "./11ty/shipping.js";
import time from "./11ty/time.js";

export default async function(eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));

  eleventyConfig.addPlugin(collect);
  eleventyConfig.addPlugin(images);
  eleventyConfig.addPlugin(markdown);
  eleventyConfig.addPlugin(shipping);
  eleventyConfig.addPlugin(time);

  eleventyConfig.addPlugin(pluginWebc, {
    components: [
      'src/_webc/**/*.webc',
      'npm:@11ty/eleventy-img/*.webc',
      'npm:@11ty/is-land/*.webc',
      'npm:@terriblemia/ground-control/*.webc',
    ],
  });

  eleventyConfig.addPassthroughCopy({
    './src/_css': 'css',
    './src/_fonts': 'fonts',
    './src/_favicons/*.*': './',
  });

  return {
    dir: {
      input: 'src',
      layouts: '_layouts',
    }
  }
}
