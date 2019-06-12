type state = {interval: option(Js.Global.intervalId)};

[@react.component]
let make = (~cpu: Rawbones.Cpu.t) => {
  let forceUpdate = Hooks.useForceUpdate();
  let (state, setState) = React.useState(() => ({interval: None}: state));

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
    setState(_ => {
      let interval = Js.Global.setInterval(step, 10);
      {interval: Some(interval)};
    });
  };

  let stop = () => {
    setState(state => {
      switch (state.interval) {
      | Some(interval) => Js.Global.clearInterval(interval)
      | _ => ()
      };
      {interval: None};
    });
  };

  let run_toggle =
    switch (state.interval) {
    | Some(_) =>
      <a className="card-footer-item" onClick={_ => stop()}>
        {str("Stop")}
      </a>
    | None =>
      <a className="card-footer-item" onClick={_ => start()}>
        {str("Start")}
      </a>
    };

  let controls =
    <div className="card">
      <header className="card-header">
        <p className="card-header-title"> {str(cpu.memory.rom.pathname)} </p>
      </header>
      <div className="card-content">
        <table className="table">
          <tbody>
            <tr> <th> {str("PC")} </th> <td> {hex(cpu.pc)} </td> </tr>
            <tr> <th> {str("Acc")} </th> <td> {hex(cpu.acc)} </td> </tr>
            <tr> <th> {str("X")} </th> <td> {hex(cpu.x)} </td> </tr>
            <tr> <th> {str("Y")} </th> <td> {hex(cpu.y)} </td> </tr>
            <tr>
              <th> {str("Status")} </th>
              <td> {hex(Rawbones.Flag.Register.to_int(cpu.status))} </td>
            </tr>
            <tr> <th> {str("Stack")} </th> <td> {hex(cpu.stack)} </td> </tr>
            <tr>
              <th> {str("Cycles")} </th>
              <td> {hex(cpu.cycles)} </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer className="card-footer">
        <a className="card-footer-item" onClick={_ => reset()}>
          {str("Reset")}
        </a>
        <a className="card-footer-item" onClick={_ => step()}>
          {str("Step")}
        </a>
        run_toggle
      </footer>
    </div>;

  <div className="columns">
    <div className="column is-one-quarter"> controls </div>
    <div className="column is-half">
      <pre> {str(disassemble(cpu.pc, 25))} </pre>
    </div>
    <div className="column is-half"> <Patterns rom={cpu.memory.rom} /> </div>
  </div>;
};