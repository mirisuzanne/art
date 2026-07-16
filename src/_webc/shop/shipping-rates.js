class ShippingRates extends HTMLElement {
	static register(tagName) {
		if ("customElements" in window) {
			customElements.define(tagName || "shipping-rates", ShippingRates);
		}
	}

  static #appendShadowTemplate = (node) => {
    const template = document.createElement("template");
    template.innerHTML = `
			<form action="https://usps-rates.netlify.app/api" part="form">
				<public-field hidden>${ShippingRates.#zipInput('from')}</public-field>
				<public-field>${ShippingRates.#zipInput('to')}</public-field>
				<public-field hidden>${ShippingRates.#countrySelect}</public-field>

				<ship-items hidden></ship-items>

				<button part="button">estimate shipping</button>
				<output part="result" hidden></output>
			</form>
    `;
    const shadowRoot = node.attachShadow({ mode: "open" });
    shadowRoot.appendChild(template.content.cloneNode(true));
  }

  static #adoptShadowStyles = (node) => {
    const shadowStyle = new CSSStyleSheet();
    shadowStyle.replaceSync(`
			:host { display: block; }

			:host([data-status="fetching"]) button::after {
				content: '…';
			}

			:host([data-status="error"]) {
				--status-color: red;
			}

			[hidden] { display: none !important; }

			output {
				display: block;
				border-inline-start: thick solid var(--status-color, currentColor);
				padding-inline-start: 1ch;
			}

			form {
				display: grid;
				gap: 0.25lh;
			}

			public-field {
				align-items: baseline;
				display: flex;
				flex-flow: wrap;
				gap: 1ch;
			}

			input, select, button {
				font: inherit;
				flex: 1;
			}

			input:user-invalid:not(:focus) {
				border-color: red;
			}

			input, select {
				inline-size: 6ch;
			}
    `);
    node.shadowRoot.adoptedStyleSheets = [shadowStyle];
  }

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
	#output;

	estimate;

	get api() {
		return this.#form.getAttribute('action');
	}

	set api(value) {
		this.#form.setAttribute('action', value);
	}

	get from() {
		return this.#publicFields.from.value;
	}

	set from(value) {
		this.#publicFields.from.value = value || '';
		this.#publicFieldHidden('from', value);
	}

	get items() {
		return this.#items;
	}

	set items(value) {
		this.#items = value;
		this.#updateForm();
		this.#outputMessage('');
		this.dispatchEvent(ShippingRates.staleShippingRate);
	}

	get inputs() {
		return Array.from(this.#formItemList.children);
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

		this.#form.addEventListener("submit", this.#submitForm);
		this.#publicFields.country.addEventListener("change", this.#handleCountry);
	}

	disconnectedCallback() {
		this.#form.removeEventListener("submit", this.#submitForm);
		this.#publicFields.country.removeEventListener("change", this.#handleCountry);
	}

	// setup
	#init = () => {
		this.#form = this.shadowRoot.querySelector('[part=form]');
		this.#output = this.shadowRoot.querySelector('[part=result]');
		this.#formItemList = this.shadowRoot.querySelector('ship-items');

		this.#form.querySelectorAll('public-field :is(input, select)').forEach(
			(input) => { this.#publicFields[input.name] = input; }
		);

		this.api = this.dataset.api;
		this.from = this.dataset.from;

		const to = localStorage.getItem('zip');
		if (to) { this.#publicFields.to.value = to; }

		this.#publicFieldHidden('country', !this.dataset.global);
		this.#itemFromDataSet();
	}

	// handlers
	#submitForm = (event) => {
  	event.preventDefault();
  	this.#fetchData();
	}

	#handleCountry = () => {
		if (this.#publicFields.country.value === 'US') {
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
			?.closest('public-field')
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
			this.dataset.status = "no-data";
			console.error(body);
			this.#outputMessage(body, 'error');
		} else {
			this.#uspsData = body;
			this.#updateResults();
			localStorage.setItem('zip', this.#publicFields.to.value);
		}
	}

	#updateResults = () => {
		if (!this.#uspsData.total) {
			console.error(this.#uspsData);
			this.#outputMessage('Something went wrong', 'error');
			return;
		}

		this.estimate = this.#uspsData.total;
		this.#outputMessage(`Estimated shipping: $${this.estimate}`);
		this.dispatchEvent(ShippingRates.newShippingRate);
	}

	#outputMessage = (message, state) => {
		this.#output.value = message;
		this.dataset.status = state || 'success';
		this.#output.toggleAttribute('hidden', !message);
	}

	// static
	static #usPostalPattern = '[\\d]{5}(-[\\d]{4})?';

	static #zipInput(name) {
		const label = name === 'from'
			? 'From'
			: 'To';

		return `
	  	<label for="${name}" part="label">${label} postal code</label>
			<input id="${name}" name="${name}" type="text" inputmode="numeric" pattern="${ShippingRates.#usPostalPattern}" part="postal-code" autocomplete="postal-code">
		`;
	};

	static #countrySelect = `
		<label for="country" part="label">Country</label>
		<select id="country" name="country" part="country" autocomplete="country">
			<option value="AF">Afghanistan</option>
			<option value="AX">Åland Islands</option>
			<option value="AL">Albania</option>
			<option value="DZ">Algeria</option>
			<option value="AS">American Samoa</option>
			<option value="AD">Andorra</option>
			<option value="AO">Angola</option>
			<option value="AI">Anguilla</option>
			<option value="AQ">Antarctica</option>
			<option value="AG">Antigua and Barbuda</option>
			<option value="AR">Argentina</option>
			<option value="AM">Armenia</option>
			<option value="AW">Aruba</option>
			<option value="AU">Australia</option>
			<option value="AT">Austria</option>
			<option value="AZ">Azerbaijan</option>
			<option value="BS">Bahamas</option>
			<option value="BH">Bahrain</option>
			<option value="BD">Bangladesh</option>
			<option value="BB">Barbados</option>
			<option value="BY">Belarus</option>
			<option value="BE">Belgium</option>
			<option value="BZ">Belize</option>
			<option value="BJ">Benin</option>
			<option value="BM">Bermuda</option>
			<option value="BT">Bhutan</option>
			<option value="BO">Bolivia (Plurinational State of)</option>
			<option value="BA">Bosnia and Herzegovina</option>
			<option value="BW">Botswana</option>
			<option value="BV">Bouvet Island</option>
			<option value="BR">Brazil</option>
			<option value="IO">British Indian Ocean Territory</option>
			<option value="BN">Brunei Darussalam</option>
			<option value="BG">Bulgaria</option>
			<option value="BF">Burkina Faso</option>
			<option value="BI">Burundi</option>
			<option value="CV">Cabo Verde</option>
			<option value="KH">Cambodia</option>
			<option value="CM">Cameroon</option>
			<option value="CA">Canada</option>
			<option value="BQ">Caribbean Netherlands</option>
			<option value="KY">Cayman Islands</option>
			<option value="CF">Central African Republic</option>
			<option value="TD">Chad</option>
			<option value="CL">Chile</option>
			<option value="CN">China</option>
			<option value="CX">Christmas Island</option>
			<option value="CC">Cocos (Keeling) Islands</option>
			<option value="CO">Colombia</option>
			<option value="KM">Comoros</option>
			<option value="CG">Congo</option>
			<option value="CD">Congo, Democratic Republic of the</option>
			<option value="CK">Cook Islands</option>
			<option value="CR">Costa Rica</option>
			<option value="HR">Croatia</option>
			<option value="CU">Cuba</option>
			<option value="CW">Curaçao</option>
			<option value="CY">Cyprus</option>
			<option value="CZ">Czech Republic</option>
			<option value="CI">Côte d'Ivoire</option>
			<option value="DK">Denmark</option>
			<option value="DJ">Djibouti</option>
			<option value="DM">Dominica</option>
			<option value="DO">Dominican Republic</option>
			<option value="EC">Ecuador</option>
			<option value="EG">Egypt</option>
			<option value="SV">El Salvador</option>
			<option value="GQ">Equatorial Guinea</option>
			<option value="ER">Eritrea</option>
			<option value="EE">Estonia</option>
			<option value="SZ">Eswatini (Swaziland)</option>
			<option value="ET">Ethiopia</option>
			<option value="FK">Falkland Islands (Malvinas)</option>
			<option value="FO">Faroe Islands</option>
			<option value="FJ">Fiji</option>
			<option value="FI">Finland</option>
			<option value="FR">France</option>
			<option value="GF">French Guiana</option>
			<option value="PF">French Polynesia</option>
			<option value="TF">French Southern Territories</option>
			<option value="GA">Gabon</option>
			<option value="GM">Gambia</option>
			<option value="GE">Georgia</option>
			<option value="DE">Germany</option>
			<option value="GH">Ghana</option>
			<option value="GI">Gibraltar</option>
			<option value="GR">Greece</option>
			<option value="GL">Greenland</option>
			<option value="GD">Grenada</option>
			<option value="GP">Guadeloupe</option>
			<option value="GU">Guam</option>
			<option value="GT">Guatemala</option>
			<option value="GG">Guernsey</option>
			<option value="GN">Guinea</option>
			<option value="GW">Guinea-Bissau</option>
			<option value="GY">Guyana</option>
			<option value="HT">Haiti</option>
			<option value="HM">Heard Island and Mcdonald Islands</option>
			<option value="HN">Honduras</option>
			<option value="HK">Hong Kong</option>
			<option value="HU">Hungary</option>
			<option value="IS">Iceland</option>
			<option value="IN">India</option>
			<option value="ID">Indonesia</option>
			<option value="IR">Iran</option>
			<option value="IQ">Iraq</option>
			<option value="IE">Ireland</option>
			<option value="IM">Isle of Man</option>
			<option value="IL">Israel</option>
			<option value="IT">Italy</option>
			<option value="JM">Jamaica</option>
			<option value="JP">Japan</option>
			<option value="JE">Jersey</option>
			<option value="JO">Jordan</option>
			<option value="KZ">Kazakhstan</option>
			<option value="KE">Kenya</option>
			<option value="KI">Kiribati</option>
			<option value="KP">Korea, North</option>
			<option value="KR">Korea, South</option>
			<option value="XK">Kosovo</option>
			<option value="KW">Kuwait</option>
			<option value="KG">Kyrgyzstan</option>
			<option value="LA">Lao People's Democratic Republic</option>
			<option value="LV">Latvia</option>
			<option value="LB">Lebanon</option>
			<option value="LS">Lesotho</option>
			<option value="LR">Liberia</option>
			<option value="LY">Libya</option>
			<option value="LI">Liechtenstein</option>
			<option value="LT">Lithuania</option>
			<option value="LU">Luxembourg</option>
			<option value="MO">Macao</option>
			<option value="MK">Macedonia North</option>
			<option value="MG">Madagascar</option>
			<option value="MW">Malawi</option>
			<option value="MY">Malaysia</option>
			<option value="MV">Maldives</option>
			<option value="ML">Mali</option>
			<option value="MT">Malta</option>
			<option value="MH">Marshall Islands</option>
			<option value="MQ">Martinique</option>
			<option value="MR">Mauritania</option>
			<option value="MU">Mauritius</option>
			<option value="YT">Mayotte</option>
			<option value="MX">Mexico</option>
			<option value="FM">Micronesia</option>
			<option value="MD">Moldova</option>
			<option value="MC">Monaco</option>
			<option value="MN">Mongolia</option>
			<option value="ME">Montenegro</option>
			<option value="MS">Montserrat</option>
			<option value="MA">Morocco</option>
			<option value="MZ">Mozambique</option>
			<option value="MM">Myanmar (Burma)</option>
			<option value="NA">Namibia</option>
			<option value="NR">Nauru</option>
			<option value="NP">Nepal</option>
			<option value="NL">Netherlands</option>
			<option value="AN">Netherlands Antilles</option>
			<option value="NC">New Caledonia</option>
			<option value="NZ">New Zealand</option>
			<option value="NI">Nicaragua</option>
			<option value="NE">Niger</option>
			<option value="NG">Nigeria</option>
			<option value="NU">Niue</option>
			<option value="NF">Norfolk Island</option>
			<option value="MP">Northern Mariana Islands</option>
			<option value="NO">Norway</option>
			<option value="OM">Oman</option>
			<option value="PK">Pakistan</option>
			<option value="PW">Palau</option>
			<option value="PS">Palestine</option>
			<option value="PA">Panama</option>
			<option value="PG">Papua New Guinea</option>
			<option value="PY">Paraguay</option>
			<option value="PE">Peru</option>
			<option value="PH">Philippines</option>
			<option value="PN">Pitcairn Islands</option>
			<option value="PL">Poland</option>
			<option value="PT">Portugal</option>
			<option value="PR">Puerto Rico</option>
			<option value="QA">Qatar</option>
			<option value="RE">Reunion</option>
			<option value="RO">Romania</option>
			<option value="RU">Russian Federation</option>
			<option value="RW">Rwanda</option>
			<option value="BL">Saint Barthelemy</option>
			<option value="SH">Saint Helena</option>
			<option value="KN">Saint Kitts and Nevis</option>
			<option value="LC">Saint Lucia</option>
			<option value="MF">Saint Martin</option>
			<option value="PM">Saint Pierre and Miquelon</option>
			<option value="VC">Saint Vincent and the Grenadines</option>
			<option value="WS">Samoa</option>
			<option value="SM">San Marino</option>
			<option value="ST">Sao Tome and Principe</option>
			<option value="SA">Saudi Arabia</option>
			<option value="SN">Senegal</option>
			<option value="RS">Serbia</option>
			<option value="CS">Serbia and Montenegro</option>
			<option value="SC">Seychelles</option>
			<option value="SL">Sierra Leone</option>
			<option value="SG">Singapore</option>
			<option value="SX">Sint Maarten</option>
			<option value="SK">Slovakia</option>
			<option value="SI">Slovenia</option>
			<option value="SB">Solomon Islands</option>
			<option value="SO">Somalia</option>
			<option value="ZA">South Africa</option>
			<option value="GS">South Georgia and the South Sandwich Islands</option>
			<option value="SS">South Sudan</option>
			<option value="ES">Spain</option>
			<option value="LK">Sri Lanka</option>
			<option value="SD">Sudan</option>
			<option value="SR">Suriname</option>
			<option value="SJ">Svalbard and Jan Mayen</option>
			<option value="SE">Sweden</option>
			<option value="CH">Switzerland</option>
			<option value="SY">Syria</option>
			<option value="TW">Taiwan</option>
			<option value="TJ">Tajikistan</option>
			<option value="TZ">Tanzania</option>
			<option value="TH">Thailand</option>
			<option value="TL">Timor-Leste</option>
			<option value="TG">Togo</option>
			<option value="TK">Tokelau</option>
			<option value="TO">Tonga</option>
			<option value="TT">Trinidad and Tobago</option>
			<option value="TN">Tunisia</option>
			<option value="TR">Turkey (Türkiye)</option>
			<option value="TM">Turkmenistan</option>
			<option value="TC">Turks and Caicos Islands</option>
			<option value="TV">Tuvalu</option>
			<option value="UM">U.S. Outlying Islands</option>
			<option value="UG">Uganda</option>
			<option value="UA">Ukraine</option>
			<option value="AE">United Arab Emirates</option>
			<option value="GB">United Kingdom</option>
			<option value="US" selected>United States</option>
			<option value="UY">Uruguay</option>
			<option value="UZ">Uzbekistan</option>
			<option value="VU">Vanuatu</option>
			<option value="VA">Vatican City Holy See</option>
			<option value="VE">Venezuela</option>
			<option value="VN">Vietnam</option>
			<option value="VG">Virgin Islands, British</option>
			<option value="VI">Virgin Islands, U.S</option>
			<option value="WF">Wallis and Futuna</option>
			<option value="EH">Western Sahara</option>
			<option value="YE">Yemen</option>
			<option value="ZM">Zambia</option>
			<option value="ZW">Zimbabwe</option>
		</select>
	`;
}

ShippingRates.register();
