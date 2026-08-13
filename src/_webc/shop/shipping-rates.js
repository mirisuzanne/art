class ShippingRates extends HTMLElement {
	static register(tagName) {
		if ("customElements" in window) {
			customElements.define(tagName || "shipping-rates", ShippingRates);
		}
	}

  static #appendShadowTemplate = (node) => {
    const template = document.createElement("template");
    template.innerHTML = `
			<form action="/api/shipping" part="form">
				<input type="hidden" id="from" name="from">
				<div id="ship-items" hidden></div>

				<div part="public-fields">
					<div part="to-field form-field">
						${ShippingRates.#zipInput}
					</div>
					<div part="country-field form-field" hidden>
						${ShippingRates.#countrySelect}
					</div>
				</div>

				<button type="submit" part="button">estimate shipping</button>
				<output part="result" hidden></output>
			</form>
    `;
    const shadowRoot = node.attachShadow({ mode: "open" });
    shadowRoot.appendChild(template.content.cloneNode(true));
  }

  static #adoptShadowStyles = (node) => {
    const shadowStyle = new CSSStyleSheet();
    shadowStyle.replaceSync(`
			:host {
				display: block;
				container: shipping-rates / inline-size;
			}

			:host([data-status="fetching"]) button::after {
				content: '…';
			}

			:host([data-status="error"]) {
				--status-color: var(--shipping-error-color, red);
			}

			[hidden] { display: none !important; }

			output {
				display: block;
				border-inline-start: thick solid var(--status-color, currentColor);
				padding-inline-start: 1ch;
			}

			input, select, button {
				font: inherit;
				padding: 0.25lh;
				line-height: normal;
			}

			input:user-invalid:not(:focus) {
				border-color: var(--shipping-error-color, red);
			}

			[part~=form],
			[part~=public-fields] {
				display: grid;
				gap: 0.5lh;
			}

			[part~=form-field] {
				display: grid;
			}

			[part~=button] {
				place-self: start;
			}
		`);
    node.shadowRoot.adoptedStyleSheets = [shadowStyle];
  }

  static addressChange = new Event('addressChange', {bubbles: true});
  static newShippingRate = new Event('newShippingRate', {bubbles: true});
  static staleShippingRate = new Event('staleShippingRate', {bubbles: true});

  constructor() {
    super();
    ShippingRates.#appendShadowTemplate(this);
    ShippingRates.#adoptShadowStyles(this);
  }

	#form;
	#publicFields = {};

	#formItemList;
	#items = [];

	#uspsData;
	#address;
	#output;

	#estimate;

	get estimate() {
		return this.#estimate || sessionStorage.getItem('shippingEstimate');
	}

	set estimate(value) {
		this.#estimate = value;

		if (value) {
			sessionStorage.setItem('shippingEstimate', value);
		} else {
			sessionStorage.removeItem('shippingEstimate');
		}
	}

	get api() {
		return this.#form.getAttribute('action');
	}

	set api(value) {
		if (!value) return;
		this.#form.setAttribute('action', value);
	}

	get from() {
		return this.#publicFields.from.value;
	}

	set from(value) {
		this.#publicFields.from.value = value || '';
	}

	get address() {
		const local = localStorage.getItem('shippingAddress');
		const fromStorage = JSON.parse(local) || undefined;

		return this.#address || fromStorage || {
			postalCode: this.#publicFields.to.value,
			country: this.#publicFields.country.value,
		};
	}

	set address(value) {
		if (typeof value !== 'object') throw 'Address must be an object';
		let onlyData = Object.keys(value)
			.filter((key) => value[key])
			.reduce((all, key) => ({ ...all, [key]: value[key] }), {});

		this.#address = onlyData;

		localStorage.setItem('shippingAddress', JSON.stringify(onlyData));

		if (onlyData.country) {
			this.#publicFields.country.value = onlyData.country;
		}

		if (onlyData.postalCode) {
			this.#publicFields.to.value = onlyData.postalCode;
		}

		this.dispatchEvent(ShippingRates.addressChange);
	}

	get country() {
		return this.#publicFields.country.value || this.address.country || '';
	}

	set country(value) {
		const valid = this.#validCountry(value) || '';

		let update = this.address;
		update.country = valid;
		this.address = update;
	}

	get postalCode() {
		return this.#publicFields.to.value || this.address.postalCode || '';
	}

	set postalCode(value) {
		const valid = value || '';

		let update = this.address;
		update.postalCode = valid;
		this.address = update;
	}

	get items() {
		return this.#items;
	}

	set items(value) {
		this.#items = value;
		this.#updateForm();
		this.#isStale();
	}

	get inputs() {
		return this.#formItemList
			? Array.from(this.#formItemList.children)
			: [];
	}

	get inputLookup() {
    let obj = {};

    [...this.inputs].forEach((el) => obj[el.name] = el);

    return obj;
	}

	get itemLookup() {
    let obj = {};

    [...this.items].forEach((item) => obj[item.id] = item);

    return obj;
	}

	connectedCallback() {
		this.#init();

		this.#form.addEventListener('submit', this.#submitForm);
		this.#publicFields.country.addEventListener('change', this.#handleCountry);

		Object.values(this.#publicFields).forEach((input) => {
			input.addEventListener('change', (e) => this.#outputMessage());
		});
	}

	disconnectedCallback() {
		this.#form.removeEventListener('submit', this.#submitForm);
		this.#publicFields.country.removeEventListener('change', this.#handleCountry);

		Object.values(this.#publicFields).forEach((input) => {
			input.removeEventListener('change', (e) => this.#outputMessage());
		});
	}

	// setup
	#init = () => {
		this.#form = this.shadowRoot.querySelector('[part=form]');
		this.#output = this.shadowRoot.querySelector('[part=result]');
		this.#formItemList = this.shadowRoot.querySelector('#ship-items');

		this.#publicFields.from = this.#form.querySelector('#from');
		this.#form.querySelectorAll('[part~=form-field] [name]').forEach(
			(input) => { this.#publicFields[input.name] = input; }
		);

		this.api = this.dataset.api;
		this.from = this.dataset.from;

		if (this.address?.postalCode) {
			this.#publicFields.to.value = this.address.postalCode;
		}

		if (this.address?.country) {
			this.#publicFields.country.value = this.address.country;
		}

		this.#publicFieldHidden('country', !this.dataset.global);
		this.#itemFromDataSet();
	}

	// handlers
	#submitForm = (event) => {
  	event.preventDefault();
  	this.#fetchData();
	}

	#isStale = () => {
		this.estimate = null;
		this.#outputMessage();
		this.dispatchEvent(ShippingRates.staleShippingRate);
	}

	#handleCountry = () => {
		if (this.country === 'US') {
			this.#publicFields.to.toggleAttribute('required', true);
			this.#publicFields.to.setAttribute(
				'pattern',
				ShippingRates.#usPostalPattern
			);
		} else {
			this.#publicFields.to.toggleAttribute('required', false);
			this.#publicFields.to.removeAttribute('pattern');
		}
	}

	// public methods
	addItem = (item) => {
		item.id = item.id || this.#randomId();
		this.items = [...this.items, this.#validItem(item)];
		return item.id;
	}

	itemIndex = (id) => this.items.findIndex((item) => item.id === id);
	findItem = (id) => this.items.find((item) => item.id === id);

	updateItem = (item) => {
		const index = this.itemIndex(item.id);

		if (~index) {
			let all = [...this.items];
			all[index] = this.#validItem(item);
			this.items = all;
		} else {
			this.addItem(item);
		}

		return item.id;
	}

	// internals
	#updateForm = () => {
		this.inputs.filter(
			(input) => !this.itemLookup[input.name]
		).forEach((input) => {
			input.remove();
		});

		this.items.forEach((item) => {
			const inSitu = this.#findInput(item.id);
			const itemInput = inSitu || this.#buildInput(item.id);
			itemInput.value = `${item.size.join('x')}@${item.weight}`;

			if (!inSitu) this.#formItemList.appendChild(itemInput);
		});
	}

	#buildInput = (name) => {
		let el = document.createElement('input');
		el.type = 'hidden';
		el.name = name;
		return el;
	}

	#findInput = (name) => this.#formItemList.querySelector(`[name=${name}]`);

	#publicFieldHidden = (name, hidden) => {
		this.#publicFields[name]
			?.closest('[part~=form-field]')
			?.toggleAttribute('hidden', hidden);
	}

	#itemFromDataSet = () => {
		if (!this.dataset.weight) return;

		const is3D = ['length', 'height', 'width'].every((d) => this.dataset[d]);

		if (!(this.dataset.size || is3D)) return;

		this.updateItem({
			id: 'dataset',
			weight: Number(this.dataset.weight),
			size: this.dataset.size
				? this.#sizeFromString(this.dataset.size)
				: this.#validSize([
					Number(this.dataset.length),
					Number(this.dataset.height),
					Number(this.dataset.width)
				]),
		});
	};

	#sizeFromString = (sizeStr) => this.#validSize(
		sizeStr.split(' ').map((n) => Number(n))
	);

	#randomId = (length=6) => {
		const id = Math.random().toString(36).substring(2, length+2);
		return `i-${id}`;
	}

	// validation
	#validItem = (item) => {
		if (!typeof item === 'object') {
			throw new Error(`${item} is not an item object`);
		}

		this.#validSize(item.size);
		this.#validWeight(item.weight);

		return item;
	}

	#validWeight = (weight) => {
		if (typeof weight !== 'number') {
			throw new Error(`${weight} Item weight must be a number (lbs)`);
		}

		return weight;
	}

	#validSize = (size) => {
		if (size.length !== 3) {
			throw new Error(`${size} Item size must have 3 dimensions`);
		}

		if (size.some((n) => typeof n !== 'number')) {
			throw new Error(`${size} Dimensions must be numbers (inches)`);
		}

		return size;
	}

	#validCountry = (country) => {
		if (ShippingRates.countryCodes[country]) return country;

		return Object.keys(ShippingRates.countryCodes).find(
			(key) => ShippingRates.countryCodes[key] === country
		);
	}

	// fetching async
	async #fetchData() {
		const formData = new FormData(this.#form);
		const queryString = new URLSearchParams(formData).toString();
		const url = `${this.api}?${queryString}`;

		this.dataset.status = "fetching";
		console.log('fetching', url);

		const response = await fetch(url);
		const body = await response.json();

		if (!response.ok) {
			this.dataset.status = "error";
			console.error(body);
			this.#outputMessage(body, 'error');
		} else {
			this.#uspsData = body;
			this.#updateResults();
		}
	}

	#updateResults = () => {
		this.address = this.#uspsData.address || {
			country: this.#publicFields.country.value,
			postalCode: this.#publicFields.to.value,
		};

		if (!this.#uspsData.total) {
			console.error(this.#uspsData);
			this.#outputMessage('Something went wrong', 'error');
			return;
		}

		this.estimate = this.#uspsData.total;
		this.#outputMessage(`Estimated shipping: $${this.estimate}`, 'success');
		this.dispatchEvent(ShippingRates.newShippingRate);
	}

	#outputMessage = (message, state) => {
		this.#output.value = message || '';
		this.dataset.status = state || 'no-data';
		this.#output.toggleAttribute('hidden', !message);
	}

	// static
	static #usPostalPattern = '[\\d]{5}(-[\\d]{4})?';

	static #zipInput = `
		<label for="postal-code" part="label">Postal code</label>
		<input id="postal-code" name="to" type="text" inputmode="numeric" pattern="${ShippingRates.#usPostalPattern}" part="input postal-code" autocomplete="shipping postal-code">
	`;

	static countryCodes = {
		AF: "Afghanistan",
		AX: "Åland Islands",
		AL: "Albania",
		DZ: "Algeria",
		AS: "American Samoa",
		AD: "Andorra",
		AO: "Angola",
		AI: "Anguilla",
		AQ: "Antarctica",
		AG: "Antigua and Barbuda",
		AR: "Argentina",
		AM: "Armenia",
		AW: "Aruba",
		AU: "Australia",
		AT: "Austria",
		AZ: "Azerbaijan",
		BS: "Bahamas",
		BH: "Bahrain",
		BD: "Bangladesh",
		BB: "Barbados",
		BY: "Belarus",
		BE: "Belgium",
		BZ: "Belize",
		BJ: "Benin",
		BM: "Bermuda",
		BT: "Bhutan",
		BO: "Bolivia (Plurinational State of)",
		BA: "Bosnia and Herzegovina",
		BW: "Botswana",
		BV: "Bouvet Island",
		BR: "Brazil",
		IO: "British Indian Ocean Territory",
		BN: "Brunei Darussalam",
		BG: "Bulgaria",
		BF: "Burkina Faso",
		BI: "Burundi",
		CV: "Cabo Verde",
		KH: "Cambodia",
		CM: "Cameroon",
		CA: "Canada",
		BQ: "Caribbean Netherlands",
		KY: "Cayman Islands",
		CF: "Central African Republic",
		TD: "Chad",
		CL: "Chile",
		CN: "China",
		CX: "Christmas Island",
		CC: "Cocos (Keeling) Islands",
		CO: "Colombia",
		KM: "Comoros",
		CG: "Congo",
		CD: "Congo, Democratic Republic of the",
		CK: "Cook Islands",
		CR: "Costa Rica",
		HR: "Croatia",
		CU: "Cuba",
		CW: "Curaçao",
		CY: "Cyprus",
		CZ: "Czech Republic",
		CI: "Côte d'Ivoire",
		DK: "Denmark",
		DJ: "Djibouti",
		DM: "Dominica",
		DO: "Dominican Republic",
		EC: "Ecuador",
		EG: "Egypt",
		SV: "El Salvador",
		GQ: "Equatorial Guinea",
		ER: "Eritrea",
		EE: "Estonia",
		SZ: "Eswatini (Swaziland)",
		ET: "Ethiopia",
		FK: "Falkland Islands (Malvinas)",
		FO: "Faroe Islands",
		FJ: "Fiji",
		FI: "Finland",
		FR: "France",
		GF: "French Guiana",
		PF: "French Polynesia",
		TF: "French Southern Territories",
		GA: "Gabon",
		GM: "Gambia",
		GE: "Georgia",
		DE: "Germany",
		GH: "Ghana",
		GI: "Gibraltar",
		GR: "Greece",
		GL: "Greenland",
		GD: "Grenada",
		GP: "Guadeloupe",
		GU: "Guam",
		GT: "Guatemala",
		GG: "Guernsey",
		GN: "Guinea",
		GW: "Guinea-Bissau",
		GY: "Guyana",
		HT: "Haiti",
		HM: "Heard Island and Mcdonald Islands",
		HN: "Honduras",
		HK: "Hong Kong",
		HU: "Hungary",
		IS: "Iceland",
		IN: "India",
		ID: "Indonesia",
		IR: "Iran",
		IQ: "Iraq",
		IE: "Ireland",
		IM: "Isle of Man",
		IL: "Israel",
		IT: "Italy",
		JM: "Jamaica",
		JP: "Japan",
		JE: "Jersey",
		JO: "Jordan",
		KZ: "Kazakhstan",
		KE: "Kenya",
		KI: "Kiribati",
		KP: "Korea, North",
		KR: "Korea, South",
		XK: "Kosovo",
		KW: "Kuwait",
		KG: "Kyrgyzstan",
		LA: "Lao People's Democratic Republic",
		LV: "Latvia",
		LB: "Lebanon",
		LS: "Lesotho",
		LR: "Liberia",
		LY: "Libya",
		LI: "Liechtenstein",
		LT: "Lithuania",
		LU: "Luxembourg",
		MO: "Macao",
		MK: "Macedonia North",
		MG: "Madagascar",
		MW: "Malawi",
		MY: "Malaysia",
		MV: "Maldives",
		ML: "Mali",
		MT: "Malta",
		MH: "Marshall Islands",
		MQ: "Martinique",
		MR: "Mauritania",
		MU: "Mauritius",
		YT: "Mayotte",
		MX: "Mexico",
		FM: "Micronesia",
		MD: "Moldova",
		MC: "Monaco",
		MN: "Mongolia",
		ME: "Montenegro",
		MS: "Montserrat",
		MA: "Morocco",
		MZ: "Mozambique",
		MM: "Myanmar (Burma)",
		NA: "Namibia",
		NR: "Nauru",
		NP: "Nepal",
		NL: "Netherlands",
		AN: "Netherlands Antilles",
		NC: "New Caledonia",
		NZ: "New Zealand",
		NI: "Nicaragua",
		NE: "Niger",
		NG: "Nigeria",
		NU: "Niue",
		NF: "Norfolk Island",
		MP: "Northern Mariana Islands",
		NO: "Norway",
		OM: "Oman",
		PK: "Pakistan",
		PW: "Palau",
		PS: "Palestine",
		PA: "Panama",
		PG: "Papua New Guinea",
		PY: "Paraguay",
		PE: "Peru",
		PH: "Philippines",
		PN: "Pitcairn Islands",
		PL: "Poland",
		PT: "Portugal",
		PR: "Puerto Rico",
		QA: "Qatar",
		RE: "Reunion",
		RO: "Romania",
		RU: "Russian Federation",
		RW: "Rwanda",
		BL: "Saint Barthelemy",
		SH: "Saint Helena",
		KN: "Saint Kitts and Nevis",
		LC: "Saint Lucia",
		MF: "Saint Martin",
		PM: "Saint Pierre and Miquelon",
		VC: "Saint Vincent and the Grenadines",
		WS: "Samoa",
		SM: "San Marino",
		ST: "Sao Tome and Principe",
		SA: "Saudi Arabia",
		SN: "Senegal",
		RS: "Serbia",
		CS: "Serbia and Montenegro",
		SC: "Seychelles",
		SL: "Sierra Leone",
		SG: "Singapore",
		SX: "Sint Maarten",
		SK: "Slovakia",
		SI: "Slovenia",
		SB: "Solomon Islands",
		SO: "Somalia",
		ZA: "South Africa",
		GS: "South Georgia and the South Sandwich Islands",
		SS: "South Sudan",
		ES: "Spain",
		LK: "Sri Lanka",
		SD: "Sudan",
		SR: "Suriname",
		SJ: "Svalbard and Jan Mayen",
		SE: "Sweden",
		CH: "Switzerland",
		SY: "Syria",
		TW: "Taiwan",
		TJ: "Tajikistan",
		TZ: "Tanzania",
		TH: "Thailand",
		TL: "Timor-Leste",
		TG: "Togo",
		TK: "Tokelau",
		TO: "Tonga",
		TT: "Trinidad and Tobago",
		TN: "Tunisia",
		TR: "Turkey (Türkiye)",
		TM: "Turkmenistan",
		TC: "Turks and Caicos Islands",
		TV: "Tuvalu",
		UM: "U.S. Outlying Islands",
		UG: "Uganda",
		UA: "Ukraine",
		AE: "United Arab Emirates",
		GB: "United Kingdom",
		US: "United States",
		UY: "Uruguay",
		UZ: "Uzbekistan",
		VU: "Vanuatu",
		VA: "Vatican City Holy See",
		VE: "Venezuela",
		VN: "Vietnam",
		VG: "Virgin Islands, British",
		VI: "Virgin Islands, U.S",
		WF: "Wallis and Futuna",
		EH: "Western Sahara",
		YE: "Yemen",
		ZM: "Zambia",
		ZW: "Zimbabwe",
	};

	static #countrySelect = `
		<label for="country" part="label">Country</label>
		<select id="country" name="country" part="country" autocomplete="shipping country">
			${Object.keys(ShippingRates.countryCodes).map((code) => {
				const selected = code === 'US' ? ` selected` : '';

				return `
					<option value="${code}"${selected}>
						${ShippingRates.countryCodes[code]}
					</option>
				`;
			}).join('')}
		</select>
	`;
}

ShippingRates.register();
