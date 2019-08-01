type requestId = int;
type charcode = int;

type t =
  | Load(Rawbones.Nes.t)
  | Reset
  | Dirty
  | StepCpu
  | StepFrame
  | KeyDown(charcode)
  | KeyUp(charcode)
  | QueueFrame(requestId)
  | Stop
  | Start;