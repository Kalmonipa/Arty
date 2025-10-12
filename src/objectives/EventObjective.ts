import { Character } from "./Character.js";
import { Objective } from "./Objective.js";
import { getActiveEvents } from "../api_calls/Events.js";
import { ApiError } from "./Error.js";
import { getResourceInformation } from "../api_calls/Resources.js";

export class EventObjective extends Objective {
    constructor(character: Character) {
        super(character, `event_response`, 'not_started');
    
        this.character = character;
      }
    
      async runPrerequisiteChecks(): Promise<boolean> {
        return true;
      }

      async run() {
        const applicableEvents = ['magic_apparition', 'strange_apparition']

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        // Get active events
        const activeEventsResponse = await getActiveEvents({})
        if (activeEventsResponse instanceof ApiError) {
            if (this.character.handleErrors(activeEventsResponse)) {
                break;
            } else {
                return false
            }
        }
        const activeEvents = activeEventsResponse.data

        for (const event of activeEvents) {
            if (applicableEvents.includes(event.code)) {
                const resourceInfoResponse = await getResourceInformation(event.code)
                if (resourceInfoResponse instanceof ApiError) {
                    if (this.character.handleErrors(resourceInfoResponse)) {
                        break;
                    } else {
                        return false
                    }
                }
                

            }
        }



        // See if we can participate (i.e. are we high enough level to gather?; fight sim on the mob to check if we can fight; etc)
        // Find location of the event
        // Move to and perform required steps (gather/fight/etc)



        return true;
      }
    }
}
