type state = {
  cpu: Rawbones.Cpu.t,
  interval: option(Js.Global.intervalId),
  // Many actions update the state of the CPU itself.
  // Toggle this to force a re-render.
  toggle: bool,
};

type action =
  | Dirty
  | Reset
  | Step;

let reducer = (state, action) => {
  let dirty = s => {...s, toggle: !s.toggle};

  switch (action) {
  | Dirty => dirty(state)
  | Reset =>
    Rawbones.Cpu.reset(state.cpu);
    dirty(state);
  | Step =>
    Rawbones.Cpu.step(state.cpu);
    dirty(state);
  | _ => state
  };
};

[@react.component]
let make = (~nes: Rawbones.Nes.t) => {
  let (state, dispatch) =
    React.useReducer(
      reducer,
      {cpu: nes.cpu, interval: None, toggle: false}: state,
    );

  let cpu = state.cpu;

  let str = ReasonReact.string;
  let disassemble = Rawbones.Disassemble.make(nes.cpu.memory);

  let row = (label: string, value: 'a, setValue: 'a => unit) => {
    let setAndApply = a => {
      setValue(a);
      dispatch(Dirty);
    };

    <tr>
      <th> {str(label)} </th>
      <td> <HexInput value setValue=setAndApply /> </td>
    </tr>;
  };

  let controls =
    <div className="card">
      <div className="card-content">
        <table className="table">
          <tbody>
            {row("PC", cpu.pc, pc => cpu.pc = pc)}
            {row("ACC", cpu.acc, acc => cpu.acc = acc)}
            {row("X", cpu.x, x => cpu.x = x)}
            {row("Y", cpu.y, y => cpu.y = y)}
            {row("Status", Rawbones.Flag.Register.to_int(cpu.status), status =>
               cpu.status = Rawbones.Flag.Register.from_int(status)
             )}
            {row("Stack", cpu.stack, stack => cpu.stack = stack)}
            {row("Cycles", cpu.cycles, cycles => cpu.cycles = cycles)}
          </tbody>
        </table>
      </div>
      <footer className="card-footer">
        <a className="card-footer-item" onClick={_ => dispatch(Reset)}>
          {str("Reset")}
        </a>
        <a className="card-footer-item" onClick={_ => dispatch(Step)}>
          {str("Step")}
        </a>
      </footer>
    </div>;

  <div className="columns">
    <div className="column is-one-quarter"> controls </div>
    <div className="column is-half">
      <pre> {str(disassemble(cpu.pc, 25))} </pre>
    </div>
  </div>;
};