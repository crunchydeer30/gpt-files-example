import { Controller, InternalServerErrorException, Post } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  private openai: OpenAI;
  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
    });
  }

  // К каждой категории можно прикрепить собственного ассистента
  // Можно создать одного универсального для простоты
  private CATEGORY = {
    id: 1,
    name: 'Программирование',
    instructions:
      'Ты репетитор по программированию, отвечай на вопросы, связанные с программированием',
    assistantId: this.configService.getOrThrow<string>('ASSISTANT_ID'),
  };

  // К кажому чату можно прикрепить свой тред
  // Как вариант есть createThreadAndRun(), каждый раз создавать новый тред. Вероятно, дорого по токенам
  //  Можно один тред на пользователя, но тогда есть риск Race Conditions
  private CHAT = {
    id: 1,
    threadId: this.configService.getOrThrow<string>('THREAD_ID'),
    category: this.CATEGORY,
    messages: [],
  };

  // Минимальный рабочий пример
  // https://platform.openai.com/docs/assistants/quickstart
  @Post('/example')
  async createMessageWithFile() {
    // Загрузка файла в хранилище OpenAI
    // Для простоты пока что локальный файл
    const uploadedFile = await this.openai.files.create({
      file: fs.createReadStream('./main.c'),
      purpose: 'assistants',
    });

    await this.openai.beta.threads.messages.create(this.CHAT.threadId, {
      role: 'user',
      content: 'Объясни код в приложенном файле:\n',
      attachments: [
        {
          file_id: uploadedFile.id,
          // Тут можно предварительно посмотреть формат файла и подключить нужные инструменты
          // Инструменты можно хранить в категории например
          // https://platform.openai.com/docs/assistants/tools
          // Есть возможность работы с функциями: https://platform.openai.com/docs/assistants/tools/function-calling
          tools: [{ type: 'code_interpreter' }],
        },
      ],
    });

    const run = await this.openai.beta.threads.runs.createAndPoll(
      this.CHAT.threadId,
      {
        assistant_id: this.CHAT.category.assistantId,
        // Можно и сюда инструкции добавить
        instructions: this.CATEGORY.instructions,
      },
    );
    if (run.status === 'completed') {
      const messages = await this.openai.beta.threads.messages.list(
        run.thread_id,
      );
      console.log(messages.data.reverse()[0]);
      return { message: messages.data.reverse()[0] };
    } else {
      throw new InternalServerErrorException('Ошибка при отправке сообщения');
    }
  }

  // Простой вариант для текстовых файлов
  // Есть вариант приложить URL изображения и попросить работать с ним, но тогда придется хранить у себя
  @Post('/simple-example')
  async simpleExample() {
    const file = fs.readFileSync('./main.c');
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Explain the following file:\n\n${file}`,
            },
          ],
        },
      ],
    });
    return { response };
  }

  // @Post('/assistants')
  // async createAssistant() {
  //   const assistant = await this.openai.beta.assistants.create({
  //     name: this.CATEGORY.name,
  //     instructions: this.CATEGORY.instructions,
  //     tools: [{ type: 'code_interpreter' }],
  //     model: 'gpt-4o',
  //   });
  //   return { assistant };
  // }

  // @Post('/threads')
  // async createThread() {
  //   const thread = await this.openai.beta.threads.create();
  //   return { thread };
  // }

  // @Post('/threads/:id/messages')
  // async createMessage(@Param('id') id: string) {
  //   const message = await this.openai.beta.threads.messages.create(id, {
  //     role: 'user',
  //     content: 'Explain the following file:\n\n',
  //     attachments: [
  //       {
  //         file_id: 'fileId',
  //         tools: [{ type: 'code_interpreter' }],
  //       },
  //     ],
  //   });
  //   return { message };
  // }

  // @Post('/threads/:id/run')
  // async runThread(
  //   @Param('id') id: string,
  //   @Body() body: { assistantId: string },
  // ) {
  //   const run = await this.openai.beta.threads.runs.createAndPoll(id, {
  //     assistant_id: body.assistantId,
  //     instructions:
  //       'Please address the user as Jane Doe. The user has a premium account.',
  //   });
  //   if (run.status === 'completed') {
  //     const messages = await this.openai.beta.threads.messages.list(
  //       run.thread_id,
  //     );
  //     return { messages };
  //   }
  // }

  // @Post('/upload')
  // @UseInterceptors(FileInterceptor('file'))
  // async uploadFileToOpenAI() {
  //   const uploadedFile = await this.openai.files.create({
  //     file: fs.createReadStream('./main.c'),
  //     purpose: 'assistants',
  //   });
  //   return { uploadedFile };
  // }
}
