// Every completion, including failure and cleanup, must still own its lane.
export function requestOwner() {
  let current=null,sequence=0;
  return {
    begin(context){current=Object.freeze({sequence:++sequence,context:Object.freeze({...context})});return current;},
    owns(ticket){return ticket!==null&&ticket===current;},
    invalidate(){current=null;},
  };
}
