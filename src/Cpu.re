type state = option(Rawbones.Cpu.t);

module Display = {
  [@react.component]
  let make = (~cpu: Rawbones.Cpu.t) => {
    let hex = int => Rawbones.Disassemble.to_hex(int) |> ReasonReact.string;

    <table className="table">
      <thead>
        <tr>
          <th> {ReasonReact.string("PC")} </th>
          <th> {ReasonReact.string("Acc")} </th>
          <th> {ReasonReact.string("X")} </th>
          <th> {ReasonReact.string("Y")} </th>
          <th> {ReasonReact.string("Status")} </th>
          <th> {ReasonReact.string("Stack")} </th>
          <th> {ReasonReact.string("Cycles")} </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> {hex(cpu.pc)} </td>
          <td> {hex(cpu.acc)} </td>
          <td> {hex(cpu.x)} </td>
          <td> {hex(cpu.y)} </td>
          <td> {hex(Rawbones.Flag.Register.to_int(cpu.status))} </td>
          <td> {hex(cpu.stack)} </td>
          <td> {hex(cpu.cycles)} </td>
        </tr>
      </tbody>
    </table>;
  };
};

[@react.component]
let make = () => {
  let (state, setState) = React.useState(() => None);
  let fileRef = React.useRef(Js.Nullable.null);

  let loadRom = rom => {
    setState(_ => {
      let cpu =
        Bytes.of_string(rom)
        |> Rawbones.Rom.parse("loaded")
        |> Rawbones.Memory.build
        |> Rawbones.Cpu.build;

      cpu.pc = 0xc000;

      Some(cpu);
    });
  };

  let step = () =>
    setState(s =>
      switch (s) {
      | Some(cpu) =>
        Rawbones.Cpu.step(cpu);
        Some(Rawbones.Cpu.copy(cpu));
      | _ => None
      }
    );

  let start = () => {
    Js.Global.setInterval(step, 1);
    ();
  };

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

  let preview =
    switch (state) {
    | None => <span />
    | Some(cpu) => <Display cpu />
    };

  <div>
    <input
      type_="file"
      ref={ReactDOMRe.Ref.domRef(fileRef)}
      onChange={_ => handleFileUpload(loadRom)}
    />
    preview
    <button onClick={_ => step()}> {ReasonReact.string("Step")} </button>
    <button onClick={_ => start()}> {ReasonReact.string("Start")} </button>
  </div>;
};