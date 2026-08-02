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

      const limit  = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      if (
        request.state.systemSettings === undefined ||
        request.state.user === undefined ||
        request.state.user.userRole !== "userRoleSystemAdministrator"
      )
      return;

      const out: string[] = [];

      const courseParticipations = application.database.all<{
          course: number
          courseParticipationRole: "courseParticipationRoleInstructor" | "courseParticipationRoleStudent"
      }>(sql`
          select "course", "courseParticipationRole" from "courseParticipations"
          where "user" = ${request.state.user.id}
      `);
      

      for (const courseParticipation of courseParticipations) {
        // const isStudent = courseParticipation.courseParticipationRole === "courseParticipationRoleStudent";
        const isStudent = true;

          const conversations = application.database.all<{
            title: string,
            id: number,
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
              <h1>${course!.name}</h1>
          `;


          const courseConversationsMessages = [];

          
          for (const conversation of conversations) {
              const title = conversation.title;
              // get only the initial message
              const message = application.database.get<{ 
                  content: string,
                  createdAt: string,
                  courseConversationMessageVisibility:
                    | "courseConversationMessageVisibilityEveryone"
                    | "courseConversationMessageVisibilityCourseParticipationRoleInstructors";
                  courseConversationMessageAnonymity:
                    | "courseConversationMessageAnonymityNone"
                    | "courseConversationMessageAnonymityCourseParticipationRoleStudents"
                    | "courseConversationMessageAnonymityEveryone";
                  createdByCourseParticipation: any;
              }>(sql`
                  select
                    "content",
                    "createdAt",
                    "courseConversationMessageVisibility",
                    "courseConversationMessageAnonymity",
                    "createdByCourseParticipation"
                  from "courseConversationMessages"
                  where "courseConversation" = ${conversation.id}
              `)!;

              if (message.createdAt < limit.toISOString()) {
                continue;
              }

              if (isStudent && message.courseConversationMessageVisibility === "courseConversationMessageVisibilityCourseParticipationRoleInstructors") {
                continue;
              }

              const isAnonymous =
                message.courseConversationMessageAnonymity === "courseConversationMessageAnonymityEveryone"
                || (isStudent && message.courseConversationMessageAnonymity === "courseConversationMessageAnonymityCourseParticipationRoleStudents")
                || !message.createdByCourseParticipation;
              
              let name = "Anonymous";
              if (!isAnonymous) {
                const senderCourseParticipation = application.database.get<{
                  user: number
                }>(sql`
                  select "user" from "courseParticipations"
                  where "id" = ${message.createdByCourseParticipation}
                `)!;
                
                const sender = application.database.get<{
                  name: string
                }>(sql`
                  select "name" from "users"
                  where "id" = ${senderCourseParticipation.user}
                `)!;

                name = sender.name;
              }


              courseConversationsMessages.push(
                `<h2>${title} - ${name}</h2><p>${message.content}</p>`
              );
            }
            if (courseConversationsMessages.length != 0) {
            out.push(courseTitleDisplay);
            out.push(...courseConversationsMessages);
          }
      }





      
      // application.database.scheduledBackgroundJobWorker(
      //   {
      //     schedule: "@minutely",
      //     type: "digest"
      //   },
      //   () => { 
      //     console.log(`Fetching messages from ${yesterday.toLocaleDateString()}`);
      //     const digest = collectDigestMessages(yesterday.toISOString());
      //     // if (digest === "") return;
      //     console.log(`FROM: ${application.userConfiguration.email.from}, TO: ${request.state.user!.email}, BODY: ${digest}`);
      //     application.database.backgroundJob({
      //       type: "email",
      //       parameters: {
      //         from: `"Courselore" <${application.userConfiguration.email.from}>`,
      //         to: request.state.user!.email,
      //         subject: `Courselore - Daily Digest ${yesterday.toLocaleDateString()}`,
      //         html: digest,
      //       },
      //     })
      //   }
      // );
      console.log(`Fetching messages from ${limit.toLocaleDateString()}`);
      const digest = out.join("");
      console.log(`FROM: ${application.userConfiguration.email.from}, TO: ${request.state.user!.email}`);
      application.database.backgroundJob({
        type: "email",
        parameters: {
          from: `"Courselore" <${application.userConfiguration.email.from}>`,
          to: request.state.user!.email,
          subject: `Courselore - Daily Digest ${limit.toLocaleDateString()}`,
          html: digest,
        },
      })

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