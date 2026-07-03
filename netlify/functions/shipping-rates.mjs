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


const cityStateFromZip = async (zip) => {
	const auth = await getAuth();
	const cityStateResponse = await fetch(`https://${api}/addresses/v3/city-state?ZIPCode=${zip}`, {
		headers: {
			accept: 'application/json',
			Authorization: `Bearer ${auth}`,
		},
	});

	return await cityStateResponse.json();
}

const domesticRates = async (details = {}) => {
	const auth = await getAuth();
	const ratesResponse = await fetch(`https://${api}/prices/v3/base-rates/search`, {
		method: 'post',
		body: JSON.stringify({
			originZIPCode: details.from,
			destinationZIPCode: details.to,
			weight: Number(details.weight),
			length: Number(details.length),
			width: Number(details.width),
			height: Number(details.height),
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

const globalRates = async (details = {}) => {
	const mailClass = details.weight < 4
		? 'FIRST-CLASS_PACKAGE_INTERNATIONAL_SERVICE'
		: 'PRIORITY_MAIL_INTERNATIONAL';

	const auth = await getAuth();
	const ratesResponse = await fetch(`https://${api}/international-prices/v3/base-rates/search`, {
		method: 'post',
		body: JSON.stringify({
			originZIPCode: details.from,
			foreignPostalCode: details.to,
			destinationCountryCode: details.country,
			weight: Number(details.weight),
			length: Number(details.length),
			width: Number(details.width),
			height: Number(details.height),
			priceType: "COMMERCIAL",
			mailClass,
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

export default async (request, context) => {
	try {
		const url = new URL(request.url);
		const query = new URLSearchParams(url.search);

		const details = {
			from: query.get('from') || '80205',
			to: query.get('to'),
			weight: query.get('weight'),
			length: query.get('length'),
			width: query.get('width'),
			height: query.get('height'),
			country: query.get('country') || 'us',
		}

		if (!details.to) throw 'No destination zip code provided';

		if (!Object.values(details).every((value) => value)) {
			const reply = await cityStateFromZip(details.to);

			return new Response(
				JSON.stringify(reply),
				{ status: 200, statusText: 'ok', }
			);
		}

		const reply = details.country === 'US'
			? await domesticRates(details)
			: await globalRates(details);

		return new Response(
			JSON.stringify(reply),
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
