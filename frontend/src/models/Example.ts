import mongoose, { Schema, model, models } from "mongoose";

export interface IExample {
  title: string;
  createdAt: Date;
}

const ExampleSchema = new Schema<IExample>(
  {
    title: { type: String, required: true },
  },
  { timestamps: true }
);

const Example = models.Example || model<IExample>("Example", ExampleSchema);
export default Example;
