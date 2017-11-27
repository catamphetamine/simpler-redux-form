import { connect } from 'react-redux'

import { initial_form_state } from '../reducer'
import { get_configuration } from '../configuration'

import
{
	initialize_form,
	destroy_form,
	register_field,
	unregister_field,
	update_field_value,
	indicate_invalid_field,
	reset_invalid_indication,
	reset_form_invalid_indication,
	clear_field,
	set_field,
	focus_field,
	focused_field,
	scroll_to_field,
	scrolled_to_field,
	on_field_focused,
	set_form_validation_passed
}
from '../actions'

// Connects the form component to Redux state
export default function redux_state_connector(options)
{
	return connect
	(
		(state, props) =>
		{
			// Check for restricted React property names
			// (due to being used by `simpler-redux-form`)
			check_for_reserved_props(props)

			// Get (most probably autogenerated) form id
			// from properties passed by the `./wrapper.js`
			const form_id = props.get_form_id(state, props, options)

			// These React `props` will be passed
			// to the underlying form component
			let underlying_props

			const forms_state = state[get_configuration().reducer]

			// Check that the developer didn't forget to add `form` reducer
			if (!forms_state)
			{
				throw new Error('You forgot to add simpler-redux-form `reducer` to your Redux reducers')
			}

			const form_already_initialized = forms_state[form_id] !== undefined

			// If the form has not yet been initialized
			// then emulate its pristine state
			// (it will be initialized later at `componentWillMount()`
			//  which happens after the `constructor()` is called
			//  on the decorated component, which is where
			//  this state mapper fires for the first time)
			if (!form_already_initialized)
			{
				// Initial form state will be like this.
				// `props.values` are the initial form values (optional).
				let initial_values = props.values
				if (!initial_values)
				{
					initial_values = options.values
					if (typeof initial_values === 'function')
					{
						initial_values = initial_values(props)
					}
				}
				underlying_props = initial_form_state(initial_values)
			}
			// If the form has already been initialized,
			// then copy its state as a new object
			// to prevent mutating Redux state directly
			// (which would not be considered a good practice).
			//
			// And also in order for Redux'es `@connect()` to rerender
			// the decorated component returning a
			// new object from this mapper is required,
			// otherwise it would just see that "prevous_props === new_props"
			// and wouldn't rerender the decorated component,
			// therefore, for example, an updated `submitting` property
			// wouldn't be reflected on the screen.
			//
			else
			{
				underlying_props =
				{
					...forms_state[form_id],
					initialized : true
				}
			}

			// Pass form `id`
			underlying_props.id = form_id

			// If `submitting` is set up for this form,
			// then update the submitting status for this form.
			if (options.submitting)
			{
				// Update the submitting status for this form
				underlying_props.submitting = options.submitting(state, props)
			}

			if (options.onSubmitted)
			{
				underlying_props.onSubmitted = options.onSubmitted
			}

			if (props.onSubmitted)
			{
				underlying_props.onSubmitted = props.onSubmitted
			}

			if (options.onAbandoned)
			{
				underlying_props.onAbandoned = options.onAbandoned
			}

			if (props.onAbandoned)
			{
				underlying_props.onAbandoned = props.onAbandoned
			}

			// Return underlying form component props
			return underlying_props
		},
		// Redux `bindActionCreators`
		{
			initialize_form,
			destroy_form,
			register_field,
			unregister_field,
			update_field_value,
			indicate_invalid_field,
			reset_invalid_indication,
			reset_form_invalid_indication,
			clear_field,
			set_field,
			focus_field,
			focused_field,
			scroll_to_field,
			scrolled_to_field,
			on_field_focused,
			set_form_validation_passed
		},
		undefined,
		{ withRef: true }
	)
}

function check_for_reserved_props(props)
{
	for (let prop of Object.keys(props))
	{
		if (reserved_props.indexOf(prop) >= 0)
		{
			throw new Error(`"${prop}" prop is reserved by simpler-redux-form`)
		}
	}
}

const reserved_props =
[
	// @connect()-ed Redux state properties.
	// These properties will be taken from Redux form state.
	'fields',
	// 'values',
	'errors',
	'indicate_invalid',
	'focus',
	'scroll_to',
	'misc',

	// These properties are passed to the underlying form
	'submit',
	'reset',
	'focus',
	'clear',
	'scroll',
	'get',
	'set',
	'getLatestFocusedField',
	'submitting',
	'reset_invalid_indication',
	'resetInvalidIndication',

	// All form fields initalized flag
	'initialized'
]