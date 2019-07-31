type t =
  | Load(Rawbones.Nes.t)
  | KeyDown(int)
  | KeyUp(int)
  | Play
  | Reset
  | Running(Js.Global.intervalId)
  | Dirty
  | StepCpu
  | StepFrame
  | Stop;