const validSize = (size) => Array.isArray(size)
  && size.length === 3
  && size.every((n) => typeof n === 'number');

const numberSort = (list) => list.toSorted((a,b) => a - b);
const volume = (size) => size.reduce((all,d) => all * d, 1);
const boxSort = (list) => list.sort((a,b) => volume(a.size) - volume(b.size));

const boxFit = (size, box) => {
  const sortedSize = numberSort(size);
  const boxSize = numberSort(box.size);

  return sortedSize.every((d, i) => d <= boxSize[i]);
}

const findBox = (size, boxes) => {
  const bestBox = boxSort(boxes).find((box) => boxFit(size, box));
  return bestBox;
}

const paddedSize = (size, padding) => {
  if (!padding) return size;
  const totalPadding = padding * 2;
  return size.map((d) => d + totalPadding);
}

const shippingBox = (size, padding, boxes) =>
  findBox(paddedSize(size, padding), boxes);

const sizeToString = (size) => validSize(size)
    ? size.join('×')
    : 'no size available';

export default function (eleventyConfig) {
  eleventyConfig.addFilter('sizeToString', sizeToString);
  eleventyConfig.addFilter('paddedSize', paddedSize);
  eleventyConfig.addFilter('shippingBox', shippingBox);
};
