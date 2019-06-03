type state = {cpu: option(Rawbones.Cpu.t)};

type action =
  | LoadRom(bytes)
  | Step;

let reducer = (state, action) => {
  switch (action) {
  | LoadRom(bytes) =>
    let cpu =
      Rawbones.Rom.parse("loaded", bytes)
      |> Rawbones.Memory.build
      |> Rawbones.Cpu.build;
    {cpu: Some(cpu)};
  | Step =>
    switch (state.cpu) {
    | Some(c) => Rawbones.Cpu.step(c)
    | _ => ()
    };
    state;
  };
};

[@react.component]
let make = () => {
  let ({cpu}, dispatch) = React.useReducer(reducer, {cpu: None});
  let fileRef = React.useRef(Js.Nullable.null);

  let loadRom = rom => {
    dispatch(LoadRom(Bytes.of_string(rom)));
  };

  let stepCpu = () => dispatch(Step);

  let handleFileUpload: (string => unit) => unit = [%bs.raw
    {|
    function (handler) {
      var reader = new FileReader();

      reader.onload = function(event) {
        handler(event.target.result);
      };

      reader.readAsBinaryString(fileRef.current.files[0]);
    }
  |}
  ];

  let out =
    switch (cpu) {
    | Some((c: Rawbones.Cpu.t)) =>
      let x = c.x;
      let y = c.y;
      let acc = c.acc;
      let pc = c.pc;

      let message = {j|
x:   $x
y:   $y
acc: $acc
pc:  $pc
      |j};

      <pre> {ReasonReact.string(message)} </pre>;
    | None => <span />
    };

  <div>
    <input
      type_="file"
      ref={ReactDOMRe.Ref.domRef(fileRef)}
      onChange={_ => handleFileUpload(loadRom)}
    />
    out
    <button onClick={_ => stepCpu()}> {ReasonReact.string("Step")} </button>
  </div>;
};