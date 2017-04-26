import { Component, createElement } from 'react'
import PropTypes from 'prop-types'
import hoist_statics from 'hoist-non-react-statics'

import create_context, { context_prop_type } from './context'
import build_outer_component from './wrapper'
import redux_state_connector from './connect'

// <Form
// 	action={this.submit}>
//
// 	<Field
// 		component={Text_input}
// 		value="Text"
// 		validate={this.validate_email}
// 		error="Optional externally set error (aside validation)"/>
//
// 	<button type="submit">Submit</button>
// </Form>
//
// validate_email(value) { return 'Error message' }
//
// submit(values) { ... }
//
export function decorator_with_options(options = {})
{
	options = normalize_options(options)

	return function createFormComponent(Wrapped_component)
	{
		class Form extends Component
		{
			static propTypes =
			{
				// Form id (required)
				// (is set by the @Form() decorator)
				id : PropTypes.string,

				// These two React properties
				// can be set on the decorated form element
				// and they will be transformed into the `id` property above.
				form_id : PropTypes.string,
				formId  : PropTypes.string,

				// Initial form field values
				// (is set by the @Form() decorator
				//  gathering `value`s from all `<Field/>`s)
				initial_values : PropTypes.object,

				// Whether the form is being submitted right now
				// (is set by the @Form() decorator's `submitting` option)
				submitting : PropTypes.bool
			}

			static childContextTypes =
			{
				simpler_redux_form : context_prop_type
			}

			state =
			{
				submitting : undefined
			}

			// The stored field info is used to `validate()` field `value`s 
			// and set the corresponding `error`s
			// when calling `set(field, value)` and `clear(field)`.
			// It also holds initial field values for form `reset()`.
			fields = {}

			componentWillMount()
			{
				const { id, initialize_form, initial_values } = this.props

				// First `form.constructor` is called,
				// then `form.componentWillMount` is called,
				// then `field.constructor` is called,
				// then `field.componentWillMount` is called,
				// then `field.componentDidMount` is called,
				// then `form.componentDidMount` is called.
				initialize_form(id, initial_values)
			}

			componentWillReceiveProps(new_props)
			{
				const { initialized } = this.props
				
				// Autofocus the form when it's mounted and initialized.
				if (!initialized && new_props.initialized && options.autofocus !== false)
				{
					this.focus(undefined, new_props)
				}
			}

			componentWillUnmount()
			{
				const { id, destroy_form } = this.props

				destroy_form(id)

				this.will_be_unmounted = true
			}

			getChildContext()
			{
				const context =
				{
					simpler_redux_form: create_context(this)
            }

            return context
			}

			// `value` is initial field value
			// (which is restored on form reset)
			register_field(field, value, validate)
			{
				// The stored field info is used to `validate()` field `value`s 
				// and set the corresponding `error`s
				// when calling `set(field, value)` and `clear(field)`.
				// It also holds initial field values for form `reset()`.
				//
				// If a field happens to register the second time
				// (e.g. due to React "reconciliation" due to order change)
				// then no need to update its info.
				// This also prevents loosing the initial value of the field.
				//
				if (!this.fields[field])
				{
					this.fields[field] = { value, validate }
				}

				// This is used for `autofocus` feature
				if (!this.initially_first_field)
				{
					this.initially_first_field = field
				}
			}

			unregister_field(field, value, validate)
			{
				// The field info is not deleted on "unregister"
				// because this field can then be mounted right away after unmounting
				// due to internal React trickery ("reconciliation").
				// Therefore field info is retained.
				// This also preserves the initial value of the field.
				// delete this.fields[field]
			}

			// Public API
			reset = () =>
			{
				const { fields, initial_values } = this.props

				for (const field of Object.keys(fields))
				{
					this.set_field(field, initial_values[field])
				}

				// Make the form "untouched" again
				this.reset_form_invalid_indication()

				// Autofocus the form (if not configured otherwise)
				if (options.autofocus !== false)
				{
					this.focus()
				}
			}

			// Public API
			focus = (field, props = this.props) =>
			{
				// Focus on the first form field by default
				if (!field)
				{
					field = this.initially_first_field
				}

				this.focus_field(field)
			}

			// Resets invalid indication for the whole form
			reset_form_invalid_indication = () =>
			{
				this.props.reset_form_invalid_indication(this.props.id)
			}

			// Submits the form if it's valid.
			// Otherwise marks invalid fields.
			validate_and_submit(action)
			{
				const
				{
					id,
					fields,
					values,
					errors,
					set_form_validation_passed,
					indicate_invalid_field
				}
				=
				this.props

				// Ignores previous form submission errors until validation passes
				set_form_validation_passed(id, false)

				// Check if there are any invalid fields
				const invalid_fields = Object.keys(fields)
					.filter(field => fields[field])
					.filter(field => errors[field] !== undefined)

				// If some of the form fields are invalid
				if (invalid_fields.length > 0)
				{
					// Indicate the first invalid field error
					indicate_invalid_field(id, invalid_fields[0])

					// Scroll to the invalid field
					this.scroll_to_field(invalid_fields[0])

					// Focus the invalid field
					this.focus_field(invalid_fields[0])

					return false
				}

				// All fields are valid, submit the form

				// Stop ignoring form submission errors
				set_form_validation_passed(id, true)

				const form_data = {}

				// Pass only registered fields to form submit action
				// (because if a field is unregistered that means that
				//  its React element was removed in the process,
				//  and therefore it's not needed anymore)
				for (let key of Object.keys(fields))
				{
					form_data[key] = values[key]
				}

				let result = action(form_data)

				// If the form submit action returned a `Promise`
				// then track this `Promise`'s progress.
				if (result && typeof result.then === 'function')
				{
					this.setState({ submitting: true })

					// Sets `submitting` flag back to `false`
					const submit_finished = () =>
					{
						if (this.will_be_unmounted)
						{
							return
						}

						this.setState({ submitting: false })
					}

					result = result.then(submit_finished, submit_finished)
				}

				return result
			}

			// Creates form submit handler
			// (this function is passed as a property)
			submit = (before_submit, action) =>
			{
				if (!action)
				{
					action = before_submit
					before_submit = undefined
				}

				if (!action)
				{
					throw new Error(`No action specified for form "submit"`)
				}

				return (event) =>
				{
					// If it's an event handler then `.preventDefault()` it
					// (which is the case for the intended
					//  `<form onSubmit={ submit(...) }/>` use case)
					if (event && typeof event.preventDefault === 'function')
					{
						event.preventDefault()
					}

					// Do nothing if the form is submitting
					// (i.e. submit is in progress)
					if (this.state.submitting || this.props.submitting)
					{
						return false
					}

					// Can be used, for example, to reset
					// custom error messages.
					// (not <Field/> `error`s)
					// E.g. it could be used to reset
					// overall form errors like "Form submission failed".
					if (before_submit)
					{
						before_submit()
					}

					// Check field validity and submit the form
					return this.validate_and_submit(action)
				}
			}

			// Focuses on a given form field (used internally + public API)
			focus_field = (field) =>
			{
				const { id, focus_field } = this.props

				focus_field(id, field)
			}

			// Scrolls to a form field (used internally + public API)
			scroll_to_field = (field) =>
			{
				const { id, scroll_to_field } = this.props

				scroll_to_field(id, field)
			}

			// Clears field value (public API)
			clear_field = (field) =>
			{
				const { id, clear_field } = this.props

				const validate = this.fields[field].validate
				clear_field(id, field, validate(undefined))
			}

			// Gets field value (public API)
			get_field_value = (field) =>
			{
				const { values } = this.props

				return values[field]
			}

			// Sets field value (public API)
			set_field = (field, value) =>
			{
				const { id, set_field } = this.props

				const validate = this.fields[field].validate
				set_field(id, field, value, validate(value))
			}

			// Gets the latest focused field (public API).
			// (e.g. for Google Analytics on abandoned forms)
			get_latest_focused_field()
			{
				const { latest_focused_field } = this.props

				return latest_focused_field
			}

			// Pass through all non-internal React `props`
			passthrough_props()
			{
				const passed_props = {}

				// Drop all inner props.
				// All other user-specified props are passed on.
				for (let prop_name of Object.keys(this.props))
				{
					// Drop all inner props
					if (Form.propTypes[prop_name])
					{
						continue
					}

					passed_props[prop_name] = this.props[prop_name]
				}

				return passed_props
			}

			render()
			{
				return createElement(Wrapped_component,
				{
					...this.passthrough_props(),
					ref    : 'user_form',
					reset  : this.reset,
					submit : this.submit,
					focus  : this.focus,
					scroll : this.scroll_to_field,
					clear  : this.clear_field,
					set    : this.set_field,
					submitting : this.state.submitting || this.props.submitting,
					reset_invalid_indication : this.reset_form_invalid_indication,
					// camelCase alias
					resetInvalidIndication   : this.reset_form_invalid_indication
				})
			}
		}

		// A more meaningful React `displayName`
		Form.displayName = `Form(${get_display_name(Wrapped_component)})`

		// Connect the form component to Redux state
		const Connected_form = redux_state_connector(options)(Form)

		// Build an outer component
		// with the only purpose
		// to expose instance API methods
		const ReduxForm = build_outer_component(Connected_form, options)

		// Preserve all static methods and properties
		// defined on the original decorated component
		return hoist_statics(ReduxForm, Wrapped_component)
	}
}

function get_display_name(Wrapped)
{
	return Wrapped.displayName || Wrapped.name || 'Component'
}

function normalize_options(options)
{
	if (typeof options === 'string')
	{
		return { id: options }
	}

	return options
}

const decorator = decorator_with_options()
export default decorator