type state = {
  value: string,
  editing: bool,
}

@react.component
let make = (~value: int, ~setValue: int => unit) => {
  let valueRef = React.useRef(value)

  let (state, setState) = React.useState(() => {value: Util.displayHex(value), editing: false})

  if React.Ref.current(valueRef) != value {
    React.Ref.setCurrent(valueRef, value)
    setState(s => {...s, value: Util.displayHex(value)})
  }

  let startEditing = _ => setState(s => {...s, editing: true})

  let commit = _ =>
    switch Util.parseHex(state.value) |> Js.Nullable.toOption {
    | Some(result) =>
      setState(s => {...s, editing: false})
      setValue(result)
    | _ => ()
    }

  let handleBlur = commit

  let handleChange = event => {
    let value = ReactEvent.Form.target(event)["value"]

    setState(s => {...s, value: value})
  }

  let handleKeyPress = event => {
    let value = ReactEvent.Keyboard.key(event)

    if value == "Enter" {
      commit()
    }
  }

  if state.editing {
    <input
      className="input"
      value=state.value
      onBlur=handleBlur
      onChange=handleChange
      onKeyPress=handleKeyPress
    />
  } else {
    <span onClick=startEditing> {ReasonReact.string(state.value)} </span>
  }
}
