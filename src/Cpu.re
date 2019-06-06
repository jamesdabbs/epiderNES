type state = {interval: option(Js.Global.intervalId)};

[@react.component]
let make = (~cpu: Rawbones.Cpu.t) => {
  let forceUpdate = Hooks.useForceUpdate();
  let (_, setState) = React.useState(() => ({interval: None}: state));

  let str = ReasonReact.string;
  let disassemble = Rawbones.Disassemble.make(cpu.memory);
  let hex = int => Rawbones.Disassemble.to_hex(int) |> str;

  let reset = () => {
    Rawbones.Cpu.reset(cpu);
    if (cpu.memory.rom.pathname == "nestest.nes") {
      cpu.pc = 0xc000;
    };
    forceUpdate();
  };

  let step = () => {
    Rawbones.Cpu.step(cpu);
    forceUpdate();
  };

  let start = () => {
    setState(state => {
      let interval = Js.Global.setInterval(step, 1);
      {...state, interval: Some(interval)};
    });
  };

  let stop = () => {
    setState(state => {
      switch (state.interval) {
      | Some(interval) => Js.Global.clearInterval(interval)
      | _ => ()
      };
      {...state, interval: None};
    });
  };

  <div>
    <table className="table">
      <thead>
        <tr>
          <th> {str("PC")} </th>
          <th> {str("Acc")} </th>
          <th> {str("X")} </th>
          <th> {str("Y")} </th>
          <th> {str("Status")} </th>
          <th> {str("Stack")} </th>
          <th> {str("Cycles")} </th>
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
    </table>
    <pre> {str(disassemble(cpu.pc, 5))} </pre>
    <button onClick={_ => reset()}> {str("Reset")} </button>
    <button onClick={_ => step()}> {str("Step")} </button>
    <button onClick={_ => start()}> {str("Start")} </button>
    <button onClick={_ => stop()}> {str("Stop")} </button>
  </div>;
};