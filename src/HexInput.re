type state = {
  value: string,
  editing: bool,
};

[@react.component]
let make = (~value: int, ~setValue: int => unit) => {
  let (state, setState) =
    React.useState(() => {value: Util.displayHex(value), editing: false});

  let handleChange = event => {
    let value = ReactEvent.Form.target(event)##value;

    setState(s => {...s, value});
  };

  let handleBlur = _ => {
    switch (Util.parseHex(state.value) |> Js.Nullable.toOption) {
    | Some(result) =>
      setState(s => {...s, editing: false});
      setValue(result);
    | _ => ()
    };
  };

  let startEditing = _ => setState(s => {...s, editing: true});

  if (state.editing) {
    <input value={state.value} onChange=handleChange onBlur=handleBlur />;
  } else {
    <span onClick=startEditing> {ReasonReact.string(state.value)} </span>;
  };
};