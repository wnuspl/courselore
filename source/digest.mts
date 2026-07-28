import * as serverTypes from "@radically-straightforward/server";
import sql from "@radically-straightforward/sqlite";
import html from "@radically-straightforward/html";
import css from "@radically-straightforward/css";
import javascript from "@radically-straightforward/javascript";
import { Application } from "./index.mjs";


export default async (application: Application): Promise<void> => {
  application.server?.push({
    method: "GET",
    pathname: "/digest",
    handler: async (
      request: serverTypes.Request<
        {},
        {},
        {},
        {},
        Application["types"]["states"]["Authentication"]
      >,
      response,
    ) => {
      const yesterday  = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const collectDigestMessages = (limit: string) => {
        // This would be check for if they want digests
        // if (!request.state.user?.emailNotificationsForAllMessages) {
        //   return "";
        // }

        const out: string[] = [];

        const courseParticipations = application.database.all<{
            course: number
        }>(sql`
            select * from "courseParticipations"
            where "user" = ${request.state.user?.id}`);
        

        for (const courseParticipation of courseParticipations) {
            const conversations = application.database.all<{
            title: string,
            id: number
            }>(sql`
                select "id", "title" from "courseConversations"
                where "course" = ${courseParticipation.course}`
            );

            const course = application.database.get<{
                name: string
            }>(sql`
                select "name" from "courses"
                where "id" = ${courseParticipation.course}
            `);
            
            const courseTitleDisplay = `
                <p># ${course!.name}</p>
            `;


            const courseConversationsMessages = [];

            
            for (const conversation of conversations) {
                const title = conversation.title;
                // get only the initial message
                const originalMessage = application.database.get<{ 
                    content: string,
                    createdAt: string
                }>(sql`
                    select "content", "createdAt" from "courseConversationMessages"
                    where "courseConversation" = ${conversation.id}`
                )!;

                if (originalMessage.createdAt > limit) {
                    const pretty = `<p>${title} - ${originalMessage.content}</p>`;
                    courseConversationsMessages.push(pretty);
                }
            }
            if (courseConversationsMessages.length != 0) {
              out.push(courseTitleDisplay);
              out.push(...courseConversationsMessages);
            }
        }
        return out.join("");
      }

      if (
        request.state.systemSettings === undefined ||
        request.state.user === undefined ||
        request.state.user.userRole !== "userRoleSystemAdministrator"
      )
        return;
      
      application.database.scheduledBackgroundJobWorker(
        {
          schedule: "@minutely",
          type: "other"
        },
        () => { 
          console.log(`Fetching messages from ${yesterday.toLocaleDateString()}`);
          const digest = collectDigestMessages(yesterday.toISOString());
          if (digest === "") return;
          console.log(`FROM: ${application.userConfiguration.email.from}, TO: ${request.state.user!.email}, BODY: ${digest}`);
          application.database.backgroundJob({
            type: "email",
            parameters: {
              from: `"Courselore" <${application.userConfiguration.email.from}>`,
              to: request.state.user!.email,
              subject: `Courselore - Daily Digest ${yesterday.toLocaleDateString()}`,
              html: digest,
            },
          })
        }
      );

      response.send(
        application.layouts.main({
          request,
          response,
          head: html`<title>Digest · Courselore</title>`,
          body: "Sending one every minute"
        })
      );
    }
  });
}