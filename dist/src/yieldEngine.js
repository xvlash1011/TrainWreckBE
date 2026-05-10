"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTrainConflicts = resolveTrainConflicts;
/**
 * Applies the 10-Minute Yield Logic to a list of train schedules.
 * Returns a new modified schedule list where TN trains yield at stations.
 */
function resolveTrainConflicts(schedules) {
    // Convert standard schedules to internal ProcessedTrain with timestamps
    const pTrains = schedules.map(s => {
        return {
            code: s.trainCode,
            isPriority: s.trainCode.toUpperCase().startsWith('SE'),
            stops: s.stations.map(st => ({
                stationCode: st.stationCode,
                arr: new Date(st.arrivalTime).getTime(),
                dep: new Date(st.departureTime).getTime()
            })).filter(s => s.arr > 0 && s.dep > 0)
        };
    });
    const priorityTrains = pTrains.filter(t => t.isPriority);
    const normalTrains = pTrains.filter(t => !t.isPriority);
    // Since trains operate on single tracks between stations, two trains cannot be traveling 
    // between Station A and Station B (in either direction) at overlapping times.
    // Actually, some tracks have bypasses, but the prompt says they must yield if they catch up or intersect.
    // Specifically: "intersect with it on the same track within the next 10 minutes."
    // And "Normal train must yield by remaining held at its nearest upcoming station until the priority train passes it."
    // To simulate this pre-emptively, we iterate through every segment of every normal train.
    for (const tn of normalTrains) {
        for (let i = 0; i < tn.stops.length - 1; i++) {
            const currentStop = tn.stops[i];
            const nextStop = tn.stops[i + 1];
            let delayedBy = 0;
            // Check against all Priority trains to see if there's a conflict in the segment (currentStop -> nextStop)
            for (const se of priorityTrains) {
                // Find if SE travels the same segment (A->B or B->A) overlap
                for (let j = 0; j < se.stops.length - 1; j++) {
                    const seCurrent = se.stops[j];
                    const seNext = se.stops[j + 1];
                    const sameDirectionMatch = (currentStop.stationCode === seCurrent.stationCode && nextStop.stationCode === seNext.stationCode);
                    const oppoDirectionMatch = (currentStop.stationCode === seNext.stationCode && nextStop.stationCode === seCurrent.stationCode);
                    if (sameDirectionMatch || oppoDirectionMatch) {
                        // They share the physical segment!
                        const tnDep = currentStop.dep + delayedBy;
                        const tnArr = nextStop.arr + delayedBy;
                        const seDep = seCurrent.dep;
                        const seArr = seNext.arr;
                        // Conflict definition: Their travel times overlap.
                        // TN is on track from tnDep to tnArr
                        // SE is on track from seDep to seArr
                        const overlap = (tnDep <= seArr && tnArr >= seDep);
                        if (overlap) {
                            // EXCEPTION: "If the two trains cross each other while one of them is already scheduled to be stopped..."
                            // A pre-emptive conflict means they cross in the middle of nowhere.
                            // Meaning we MUST hold TN at `currentStop` until SE is completely out of the segment
                            // How long to wait? Wait until SE arrives at its next destination.
                            const requiredWaitEnd = oppoDirectionMatch ? seArr : (sameDirectionMatch && seDep > tnDep ? seArr : seArr);
                            if (requiredWaitEnd > tnDep) {
                                const waitTime = requiredWaitEnd - tnDep + (5 * 60 * 1000); // Wait until SE arrives + 5 mins buffer
                                delayedBy += waitTime;
                                // Mutate TN's departure from current stop, and all subsequent arrival/deps
                                currentStop.dep += waitTime;
                                // Shift the rest of the TN schedule forward by waitTime
                                for (let k = i + 1; k < tn.stops.length; k++) {
                                    tn.stops[k].arr += waitTime;
                                    tn.stops[k].dep += waitTime;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // Re-map ProcessedTrains back to TrainSchedules
    return schedules.map(s => {
        const pt = pTrains.find(p => p.code === s.trainCode);
        if (!pt)
            return s;
        // Output with stringified shifted times
        const shiftedStations = s.stations.map(st => {
            const match = pt.stops.find(pts => pts.stationCode === st.stationCode);
            if (match) {
                return {
                    ...st,
                    arrivalTime: new Date(match.arr).toISOString(),
                    departureTime: new Date(match.dep).toISOString()
                };
            }
            return st;
        });
        return { ...s, stations: shiftedStations };
    });
}
