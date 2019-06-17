type t =
  | Load(Rawbones.Nes.t)
  | Play
  | Reset
  | Running(Js.Global.intervalId)
  | Dirty
  | StepCpu
  | StepFrame
  | Stop;