import fetch from 'node-fetch';

const apiOptions = {
	test: 'apis-tem.usps.com',
	prod: 'apis.usps.com',
}

const api = apiOptions.test;

let authToken;

const getAuth = async () => {
	if (authToken) return authToken;

	const authResponse = await fetch(`https://${api}/oauth2/v3/token`, {
		method: 'post',
		body: JSON.stringify({
			grant_type: 'client_credentials',
			client_id: process.env.USPS_KEY,
			client_secret: process.env.USPS_SECRET,
		}),
		headers: {'Content-Type': 'application/json'}
	});

	const auth = await authResponse.json();
	authToken = auth.access_token;
	return auth.access_token;
}

const domesticRates = async (shipping, item) => {
	const auth = await getAuth();
	const ratesResponse = await fetch(`https://${api}/prices/v3/base-rates/search`, {
		method: 'post',
		body: JSON.stringify({
			originZIPCode: shipping.from,
			destinationZIPCode: shipping.to,
			weight: Number(item.weight),
			length: Number(item.length),
			width: Number(item.width),
			height: Number(item.height),
			priceType: "COMMERCIAL",
			mailClass: "USPS_GROUND_ADVANTAGE",
			processingCategory: "MACHINABLE",
			rateIndicator: "SP",
			destinationEntryFacilityType: "NONE",
		}),
		headers: {
			accept: 'Content-Type: application/json',
			Authorization: `Bearer ${auth}`,
			'Content-Type': 'application/json',
		},
	});

	return await ratesResponse.json();
}

const globalRates = async (shipping, item) => {
	const auth = await getAuth();
	const ratesResponse = await fetch(`https://${api}/international-prices/v3/base-rates/search`, {
		method: 'post',
		body: JSON.stringify({
			originZIPCode: shipping.from,
			foreignPostalCode: shipping.to,
			destinationCountryCode: shipping.country,
			weight: Number(item.weight),
			length: Number(item.length),
			width: Number(item.width),
			height: Number(item.height),
			priceType: "COMMERCIAL",
			mailClass: item.weight < 4
				? 'FIRST-CLASS_PACKAGE_INTERNATIONAL_SERVICE'
				: 'PRIORITY_MAIL_INTERNATIONAL',
			processingCategory: "MACHINABLE",
			rateIndicator: "SP",
			destinationEntryFacilityType: "NONE",
		}),
		headers: {
			accept: 'Content-Type: application/json',
			Authorization: `Bearer ${auth}`,
			'Content-Type': 'application/json',
		},
	});

	return await ratesResponse.json();
}

const rateForItem = async (shipping, item) => {
	const reply = shipping.country === 'US'
		? await domesticRates(shipping, item)
		: await globalRates(shipping, item);

	return Number(reply.totalBasePrice);
}

const getRatesForItems = async (shipping, items) => {
	const rates = items.map(async (item) => await rateForItem(shipping, item));
	return await Promise.all(rates);
}

const numberSort = (list) => list.toSorted((a,b) => b - a);

const expandItem = (str) => {
	const parts = str.split('@');
	const size = numberSort(parts[0].split('x').map((n) => Number(n)));

	let item = {
		weight: Number(parts[1]),
		length: size[0],
		height: size[1],
		width: size[2],
	};

	return item;
}

export default async (request, context) => {
	try {
		const query = new URL(request.url).searchParams;

		const shipping = {
			from: query.get('from') || '80205',
			to: query.get('to'),
			country: query.get('country') || 'us',
		};

		if (!shipping.to) throw 'No destination postal code provided';

		let items = [];

		query.forEach((value, key) => {
			if (shipping[key]) return;
			const item = expandItem(value);
			items.push(item);
		});

		const rates = await getRatesForItems(shipping, items);

		const total = rates.reduce((total, current) => total + current, 0)

		return new Response(
			JSON.stringify({ rates, total }),
			{ status: 200, statusText: 'ok', }
		);
	} catch (e) {
		console.error(e);

		return new Response(
			JSON.stringify(e),
			{ status: 400, }
		);
	}
}

export const config = {
  path: "/api",
	rateLimit: {
    windowLimit: 100,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
}
