type requestId = int
type character = char

type t =
  | Load(Rawbones.Nes.t)
  | Reset
  | Dirty
  | StepCpu
  | StepFrame
  | KeyDown(character)
  | KeyUp(character)
  | QueueFrame(requestId)
  | Stop
  | Start
