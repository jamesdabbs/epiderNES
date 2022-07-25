module Disassembly = {
  @react.component
  let make = (~nes: Rawbones.Nes.t, ~rows: int) => {
    let cpu = nes.cpu

    let disassemble = Rawbones.Disassemble.make(cpu.memory)
    let inspector = Rawbones.Disassemble.inspector(cpu.memory)

    <pre>
      {ReasonReact.string("              ;; " ++ (inspector(cpu.pc) ++ "\n"))}
      {ReasonReact.string(disassemble(cpu.pc, rows))}
    </pre>
  }
}

module Registers = {
  module Row = {
    @react.component
    let make = (~label: string, ~value: 'a, ~setValue: 'a => unit) =>
      <tr>
        <th> <code> {ReasonReact.string(label)} </code> </th> <td> <HexInput value setValue /> </td>
      </tr>
  }

  @react.component
  let make = (~nes: Rawbones.Nes.t, ~dispatch) => {
    let cpu = nes.cpu

    let row = (label, value, setValue) => {
      let set = x => {
        setValue(x)
        dispatch(Action.Dirty)
      }

      <Row label value setValue=set />
    }

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
  }
}
